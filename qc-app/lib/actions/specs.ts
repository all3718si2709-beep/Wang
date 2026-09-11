"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { specVersions, dimensionSpecs, visualSpecs } from "@/db/schema";
import { DEFECT_CODES, ZONES } from "@/lib/domain";
import { audit, fail, str, optStr, num, optNum, bool, zodMessage, type ActionResult } from "./shared";

function omitId<T extends { id: number }>(row: T): Omit<T, "id"> {
  const copy = { ...row } as Partial<T>;
  delete copy.id;
  return copy as Omit<T, "id">;
}

async function assertDraft(specVersionId: number) {
  const v = await db.query.specVersions.findFirst({ where: eq(specVersions.id, specVersionId) });
  if (!v) throw new Error("規格版本不存在");
  if (v.status !== "draft") throw new Error("已生效或已停用的版本不可修改,請建立新版本");
  return v;
}

/** 建立新版本:若已有版本,複製最新一版的內容當起點 */
export async function createSpecVersion(partId: number): Promise<ActionResult> {
  const existingDraft = await db.query.specVersions.findFirst({ where: and(eq(specVersions.partId, partId), eq(specVersions.status, "draft")) });
  if (existingDraft) redirect(`/parts/${partId}/spec/${existingDraft.id}`);

  const latest = await db.query.specVersions.findFirst({ where: eq(specVersions.partId, partId), orderBy: (t, { desc }) => [desc(t.version)] });
  const [v] = await db
    .insert(specVersions)
    .values({ partId, version: (latest?.version ?? 0) + 1, status: "draft", warnRatio: latest?.warnRatio ?? 0.8 })
    .returning();

  if (latest) {
    const dims = await db.select().from(dimensionSpecs).where(eq(dimensionSpecs.specVersionId, latest.id));
    if (dims.length) await db.insert(dimensionSpecs).values(dims.map((d) => ({ ...omitId(d), specVersionId: v.id })));
    const vis = await db.select().from(visualSpecs).where(eq(visualSpecs.specVersionId, latest.id));
    if (vis.length) await db.insert(visualSpecs).values(vis.map((d) => ({ ...omitId(d), specVersionId: v.id })));
  } else {
    // 第一版:外觀矩陣預設全部「不允收」,由品管逐格放寬
    await db.insert(visualSpecs).values(
      DEFECT_CODES.flatMap((d) => ZONES.map((z) => ({ specVersionId: v.id, defectCode: d.code, zone: z.code, allowed: false }))),
    );
  }
  await audit("spec_version", v.id, "create", { from: latest?.id ?? null });
  revalidatePath(`/parts/${partId}`);
  redirect(`/parts/${partId}/spec/${v.id}`);
}

export async function updateSpecMeta(specVersionId: number, fd: FormData): Promise<ActionResult> {
  const v = await assertDraft(specVersionId);
  const warnRatio = num(fd, "warnRatio");
  if (!(warnRatio > 0 && warnRatio <= 1)) return fail("警戒比例需在 0~1 之間");
  await db.update(specVersions).set({ warnRatio, notes: optStr(fd, "notes") }).where(eq(specVersions.id, specVersionId));
  revalidatePath(`/parts/${v.partId}/spec/${specVersionId}`);
  return { ok: true };
}

const dimSchema = z
  .object({
    seq: z.number().int().positive(),
    name: z.string().min(1, "必填").max(60),
    drawingRef: z.string().nullable(),
    nominal: z.number().finite(),
    tolMinus: z.number().finite().max(0, "下公差需 ≤ 0"),
    tolPlus: z.number().finite().min(0, "上公差需 ≥ 0"),
    unit: z.string().min(1).max(10),
    gauge: z.enum(["cmm", "micrometer", "height_gauge", "caliper", "plug_gauge", "other"]),
    frequency: z.enum(["each", "first", "sample", "first_last"]),
    critical: z.boolean(),
    decimals: z.number().int().min(0).max(4),
  })
  .refine((d) => !(d.tolMinus === 0 && d.tolPlus === 0), { message: "上下公差不可同時為 0", path: ["tolPlus"] });

function parseDim(fd: FormData) {
  // 下公差使用者可能輸入 0.05(正)或 -0.05,一律轉負
  const tm = num(fd, "tolMinus");
  return dimSchema.safeParse({
    seq: num(fd, "seq"),
    name: str(fd, "name"),
    drawingRef: optStr(fd, "drawingRef"),
    nominal: num(fd, "nominal"),
    tolMinus: Number.isFinite(tm) ? -Math.abs(tm) : tm,
    tolPlus: Math.abs(num(fd, "tolPlus")),
    unit: str(fd, "unit") || "mm",
    gauge: str(fd, "gauge"),
    frequency: str(fd, "frequency"),
    critical: bool(fd, "critical"),
    decimals: num(fd, "decimals"),
  });
}

export async function addDimension(specVersionId: number, fd: FormData): Promise<ActionResult> {
  const v = await assertDraft(specVersionId);
  const p = parseDim(fd);
  if (!p.success) return fail(zodMessage(p.error));
  await db.insert(dimensionSpecs).values({ ...p.data, specVersionId });
  revalidatePath(`/parts/${v.partId}/spec/${specVersionId}`);
  return { ok: true };
}

export async function updateDimension(dimId: number, fd: FormData): Promise<ActionResult> {
  const d = await db.query.dimensionSpecs.findFirst({ where: eq(dimensionSpecs.id, dimId) });
  if (!d) return fail("項次不存在");
  const v = await assertDraft(d.specVersionId);
  const p = parseDim(fd);
  if (!p.success) return fail(zodMessage(p.error));
  await db.update(dimensionSpecs).set(p.data).where(eq(dimensionSpecs.id, dimId));
  revalidatePath(`/parts/${v.partId}/spec/${d.specVersionId}`);
  return { ok: true };
}

export async function deleteDimension(dimId: number): Promise<ActionResult> {
  const d = await db.query.dimensionSpecs.findFirst({ where: eq(dimensionSpecs.id, dimId) });
  if (!d) return fail("項次不存在");
  const v = await assertDraft(d.specVersionId);
  await db.delete(dimensionSpecs).where(eq(dimensionSpecs.id, dimId));
  revalidatePath(`/parts/${v.partId}/spec/${d.specVersionId}`);
  return { ok: true };
}

/** 外觀矩陣整批儲存:每格 allowed / maxSize / maxCount */
export async function saveVisualMatrix(specVersionId: number, fd: FormData): Promise<ActionResult> {
  const v = await assertDraft(specVersionId);
  for (const d of DEFECT_CODES) {
    for (const z of ZONES) {
      const k = `${d.code}__${z.code}`;
      const allowed = bool(fd, `${k}__allowed`);
      const maxSizeMm = allowed ? optNum(fd, `${k}__size`) : null;
      const maxCount = allowed ? optNum(fd, `${k}__count`) : null;
      if (maxSizeMm != null && !(maxSizeMm > 0)) return fail(`${d.nameZh} × ${z.nameZh}:尺寸上限需 > 0`);
      if (maxCount != null && !(Number.isInteger(maxCount) && maxCount > 0)) return fail(`${d.nameZh} × ${z.nameZh}:數量上限需為正整數`);
      await db
        .insert(visualSpecs)
        .values({ specVersionId, defectCode: d.code, zone: z.code, allowed, maxSizeMm, maxCount })
        .onConflictDoUpdate({ target: [visualSpecs.specVersionId, visualSpecs.defectCode, visualSpecs.zone], set: { allowed, maxSizeMm, maxCount } });
    }
  }
  revalidatePath(`/parts/${v.partId}/spec/${specVersionId}`);
  return { ok: true };
}

/** 生效:同料號其他 active 版本轉 retired;草稿至少要有一個尺寸項次 */
export async function activateSpecVersion(specVersionId: number): Promise<ActionResult> {
  const v = await assertDraft(specVersionId);
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(dimensionSpecs).where(eq(dimensionSpecs.specVersionId, specVersionId));
  if (n === 0) return fail("至少要有一個尺寸項次才能生效");
  const nowIso = new Date().toISOString();
  await db
    .update(specVersions)
    .set({ status: "retired", retiredAt: nowIso })
    .where(and(eq(specVersions.partId, v.partId), eq(specVersions.status, "active")));
  await db.update(specVersions).set({ status: "active", activatedAt: nowIso }).where(eq(specVersions.id, specVersionId));
  await audit("spec_version", specVersionId, "activate");
  revalidatePath(`/parts/${v.partId}`);
  revalidatePath(`/parts/${v.partId}/spec/${specVersionId}`);
  revalidatePath("/parts");
  return { ok: true };
}

export async function deleteDraftVersion(specVersionId: number): Promise<ActionResult> {
  const v = await assertDraft(specVersionId);
  await db.delete(dimensionSpecs).where(eq(dimensionSpecs.specVersionId, specVersionId));
  await db.delete(visualSpecs).where(eq(visualSpecs.specVersionId, specVersionId));
  await db.delete(specVersions).where(eq(specVersions.id, specVersionId));
  revalidatePath(`/parts/${v.partId}`);
  redirect(`/parts/${v.partId}`);
}
