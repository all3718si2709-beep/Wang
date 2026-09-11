"use server";
import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import path from "node:path";
import fs from "node:fs/promises";
import { db } from "@/db";
import { lots, pieces, measurements, visualFindings, dimensionSpecs, visualSpecs, specVersions } from "@/db/schema";
import { judgeDimension, judgeFinding, judgePiece } from "@/lib/engine";
import { defectByCode, ZONES } from "@/lib/domain";
import { audit, fail, str, optStr, optNum, type ActionResult } from "./shared";

const PHOTO_DIR = path.join(process.cwd(), "data", "photos");

async function loadPieceContext(pieceId: number) {
  const piece = await db.query.pieces.findFirst({ where: eq(pieces.id, pieceId) });
  if (!piece) throw new Error("件不存在");
  const lot = await db.query.lots.findFirst({ where: eq(lots.id, piece.lotId) });
  if (!lot) throw new Error("批不存在");
  if (lot.status === "closed") throw new Error("已結批,不可修改;請先重開");
  const spec = await db.query.specVersions.findFirst({ where: eq(specVersions.id, lot.specVersionId) });
  const dims = await db.select().from(dimensionSpecs).where(eq(dimensionSpecs.specVersionId, lot.specVersionId));
  const visuals = await db.select().from(visualSpecs).where(eq(visualSpecs.specVersionId, lot.specVersionId));
  return { piece, lot, spec: spec!, dims, visuals };
}

/** 重新計算某件的引擎判定並寫回 */
async function rejudgePiece(pieceId: number) {
  const { piece, lot, dims } = await loadPieceContext(pieceId);
  const meas = await db.select().from(measurements).where(eq(measurements.pieceId, pieceId));
  const finds = await db.select().from(visualFindings).where(eq(visualFindings.pieceId, pieceId));
  const r = judgePiece({
    inspectionType: lot.inspectionType,
    dimensionSpecs: dims,
    measurements: meas,
    findings: finds,
  });
  if (r.verdict !== piece.engineVerdict) {
    await db.update(pieces).set({ engineVerdict: r.verdict, updatedAt: new Date().toISOString() }).where(eq(pieces.id, pieceId));
  }
  return r.verdict;
}

/** 同一件的外觀發現依序重判(數量累計會互相影響) */
async function rejudgeFindings(pieceId: number, visuals: { defectCode: string; zone: string; allowed: boolean; maxSizeMm: number | null; maxCount: number | null }[]) {
  const finds = await db.select().from(visualFindings).where(eq(visualFindings.pieceId, pieceId)).orderBy(asc(visualFindings.id));
  for (let i = 0; i < finds.length; i++) {
    const r = judgeFinding(visuals, finds[i], finds.slice(0, i));
    if (r.judgement !== finds[i].judgement) {
      await db.update(visualFindings).set({ judgement: r.judgement }).where(eq(visualFindings.id, finds[i].id));
    }
  }
}

export interface SaveMeasurementResult {
  ok: boolean;
  error?: string;
  judgement?: "OK" | "WARN" | "NG" | null;
  pieceVerdict?: "OK" | "NG" | "REVIEW" | "PENDING";
}

/** 存一個量測值;value 為 null 代表清除 */
export async function saveMeasurement(pieceId: number, dimensionSpecId: number, value: number | null, source: "manual" | "bluetooth" = "manual"): Promise<SaveMeasurementResult> {
  try {
    const { spec, dims } = await loadPieceContext(pieceId);
    const dim = dims.find((d) => d.id === dimensionSpecId);
    if (!dim) return { ok: false, error: "尺寸項次不屬於此批的規格" };

    if (value == null) {
      await db.delete(measurements).where(and(eq(measurements.pieceId, pieceId), eq(measurements.dimensionSpecId, dimensionSpecId)));
      const pieceVerdict = await rejudgePiece(pieceId);
      return { ok: true, judgement: null, pieceVerdict };
    }
    if (!Number.isFinite(value)) return { ok: false, error: "不是數字" };
    const r = judgeDimension(dim, value, spec.warnRatio);
    await db
      .insert(measurements)
      .values({ pieceId, dimensionSpecId, value, judgement: r.judgement, source, measuredAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: [measurements.pieceId, measurements.dimensionSpecId],
        set: { value, judgement: r.judgement, source, measuredAt: new Date().toISOString() },
      });
    const pieceVerdict = await rejudgePiece(pieceId);
    return { ok: true, judgement: r.judgement, pieceVerdict };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "儲存失敗" };
  }
}

export async function addFinding(pieceId: number, fd: FormData): Promise<ActionResult> {
  try {
    const { lot, visuals } = await loadPieceContext(pieceId);
    const defectCode = str(fd, "defectCode");
    const zone = str(fd, "zone");
    const defect = defectByCode(defectCode);
    if (!defect) return fail("缺陷代號不正確");
    if (!ZONES.some((z) => z.code === zone)) return fail("區域不正確");
    const sizeMm = optNum(fd, "sizeMm");
    const count = optNum(fd, "count") ?? 1;
    const clockPosition = optNum(fd, "clockPosition");
    if (sizeMm != null && !(sizeMm > 0)) return fail("尺寸需 > 0");
    if (!(Number.isInteger(count) && count > 0)) return fail("數量需為正整數");
    if (clockPosition != null && !(Number.isInteger(clockPosition) && clockPosition >= 1 && clockPosition <= 12)) return fail("時鐘方位需為 1~12");
    const responsibility = (str(fd, "responsibility") || defect.responsibility) as "supplier" | "inhouse";

    let photoPath: string | null = null;
    const photo = fd.get("photo");
    if (photo instanceof File && photo.size > 0) {
      if (photo.size > 15 * 1024 * 1024) return fail("照片超過 15MB");
      const ext = (photo.type === "image/png" ? "png" : "jpg");
      const rel = path.join(String(lot.id), `${pieceId}-${Date.now()}.${ext}`);
      await fs.mkdir(path.join(PHOTO_DIR, String(lot.id)), { recursive: true });
      await fs.writeFile(path.join(PHOTO_DIR, rel), Buffer.from(await photo.arrayBuffer()));
      photoPath = rel.split(path.sep).join("/");
    }

    const siblings = await db.select().from(visualFindings).where(eq(visualFindings.pieceId, pieceId));
    const r = judgeFinding(visuals, { defectCode, zone, sizeMm, count }, siblings);
    const [row] = await db
      .insert(visualFindings)
      .values({ pieceId, defectCode, zone, sizeMm, count, clockPosition, photoPath, responsibility, judgement: r.judgement, note: optStr(fd, "note") })
      .returning({ id: visualFindings.id });
    await rejudgePiece(pieceId);
    revalidatePath(`/lots/${lot.id}`);
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "儲存失敗");
  }
}

export async function deleteFinding(findingId: number): Promise<ActionResult> {
  try {
    const f = await db.query.visualFindings.findFirst({ where: eq(visualFindings.id, findingId) });
    if (!f) return fail("發現不存在");
    const { lot, visuals } = await loadPieceContext(f.pieceId);
    await db.delete(visualFindings).where(eq(visualFindings.id, findingId));
    if (f.photoPath) await fs.rm(path.join(PHOTO_DIR, f.photoPath), { force: true });
    await rejudgeFindings(f.pieceId, visuals);
    await rejudgePiece(f.pieceId);
    revalidatePath(`/lots/${lot.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "刪除失敗");
  }
}

/** 人工覆判:REVIEW 件必須由人決定;也允許覆蓋引擎(留稽核) */
export async function setFinalVerdict(pieceId: number, verdict: "OK" | "NG" | null, reason: string | null, actor?: string | null): Promise<ActionResult> {
  try {
    const { lot, piece } = await loadPieceContext(pieceId);
    if (verdict && verdict !== piece.engineVerdict && !reason) return fail("覆判與引擎判定不同時,必須填理由");
    await db.update(pieces).set({ finalVerdict: verdict, finalReason: verdict ? reason : null, updatedAt: new Date().toISOString() }).where(eq(pieces.id, pieceId));
    await audit("piece", pieceId, "final_verdict", { verdict, reason, engine: piece.engineVerdict }, actor);
    revalidatePath(`/lots/${lot.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "儲存失敗");
  }
}

export async function setPieceDisposition(pieceId: number, disposition: "scrap" | "rework" | "return_supplier" | "use_as_is" | null): Promise<ActionResult> {
  try {
    const { lot } = await loadPieceContext(pieceId);
    await db.update(pieces).set({ disposition, updatedAt: new Date().toISOString() }).where(eq(pieces.id, pieceId));
    revalidatePath(`/lots/${lot.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "儲存失敗");
  }
}

export async function setPieceSerial(pieceId: number, serial: string | null): Promise<ActionResult> {
  try {
    const { lot } = await loadPieceContext(pieceId);
    await db.update(pieces).set({ serial: serial?.trim() || null }).where(eq(pieces.id, pieceId));
    revalidatePath(`/lots/${lot.id}`);
    return { ok: true };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "儲存失敗");
  }
}
