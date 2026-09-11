"use server";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { lots, pieces, measurements, dimensionSpecs, specVersions, cmmFeatureMaps, cmmImports } from "@/db/schema";
import { parseBytes, guessColumns, type ParsedTable, type ColumnRole } from "@/lib/cmm/parse";
import { matchFeature, type MatchResult } from "@/lib/cmm/match";
import { judgeDimension, judgePiece } from "@/lib/engine";
import { isAttributeGauge } from "@/lib/domain";
import { audit } from "./shared";

export interface ParsedFile {
  fileName: string;
  encoding: string;
  headers: string[];
  rows: string[][];
  preamble: string[];
  guess: Partial<Record<ColumnRole, number>>;
  /** 從抬頭猜到的件序號(例如 PC-DMIS 的 SER NUMBER) */
  serialHint: string | null;
}

const MAX_ROWS = 5000;

/** 步驟 1:上傳 → 解析每個檔 */
export async function parseCmmFiles(fd: FormData): Promise<{ ok: true; files: ParsedFile[] } | { ok: false; error: string }> {
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, error: "沒有選檔案" };
  const out: ParsedFile[] = [];
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024) return { ok: false, error: `${f.name} 超過 10MB` };
    let t: ParsedTable;
    try {
      t = parseBytes(new Uint8Array(await f.arrayBuffer()));
    } catch (e) {
      return { ok: false, error: `${f.name} 解析失敗:${e instanceof Error ? e.message : ""}` };
    }
    if (!t.rows.length) return { ok: false, error: `${f.name} 讀不到資料列(是 Excel 檔嗎?請先另存成 CSV)` };
    const serial = t.preamble.map((l) => l.match(/(ser(ial)?\s*(no|number|num)?|序號|件號|工件號)\s*[:：=]\s*([A-Za-z0-9\-]+)/i)?.[4]).find(Boolean) ?? null;
    out.push({ fileName: f.name, encoding: t.encoding, headers: t.headers, rows: t.rows.slice(0, MAX_ROWS), preamble: t.preamble.slice(0, 10), guess: guessColumns(t.headers, t.rows), serialHint: serial });
  }
  return { ok: true, files: out };
}

export interface MatchSuggestion {
  key: string;
  match: MatchResult;
}

/** 步驟 2:特性名稱 → 規格項次 建議(含存過的對應) */
export async function suggestCmmMatches(lotId: number, keys: { key: string; nominal: number | null }[]): Promise<{ ok: true; suggestions: MatchSuggestion[]; dims: { id: number; seq: number; name: string; nominal: number; tolMinus: number; tolPlus: number; decimals: number; gauge: string; drawingRef: string | null }[] } | { ok: false; error: string }> {
  const lot = await db.query.lots.findFirst({ where: eq(lots.id, lotId) });
  if (!lot) return { ok: false, error: "批不存在" };
  const dims = await db.select().from(dimensionSpecs).where(eq(dimensionSpecs.specVersionId, lot.specVersionId));
  const saved = await db.select().from(cmmFeatureMaps).where(eq(cmmFeatureMaps.specVersionId, lot.specVersionId));
  const savedMap = Object.fromEntries(saved.map((s) => [s.featureKey, s.dimensionSpecId]));
  const usable = dims.filter((d) => !isAttributeGauge(d.gauge));
  const suggestions = keys.map((k) => ({ key: k.key, match: matchFeature(k.key, k.nominal, usable, savedMap) }));
  return { ok: true, suggestions, dims: usable.map((d) => ({ id: d.id, seq: d.seq, name: d.name, nominal: d.nominal, tolMinus: d.tolMinus, tolPlus: d.tolPlus, decimals: d.decimals, gauge: d.gauge, drawingRef: d.drawingRef })) };
}

export interface CommitPayload {
  files: { fileName: string; encoding: string; readings: { key: string; actual: number; pieceSeq: number }[] }[];
  mapping: Record<string, number | null>;
  /** 已有手工 / 藍牙量測值時是否覆蓋(三次元通常較準,預設覆蓋) */
  overwriteManual: boolean;
}

/** 步驟 3:寫入 */
export async function commitCmmImport(lotId: number, payload: CommitPayload): Promise<{ ok: true; written: number; skipped: string[]; pieces: number } | { ok: false; error: string }> {
  const lot = await db.query.lots.findFirst({ where: eq(lots.id, lotId) });
  if (!lot) return { ok: false, error: "批不存在" };
  if (lot.status === "closed") return { ok: false, error: "已結批,請先重開" };
  const spec = await db.query.specVersions.findFirst({ where: eq(specVersions.id, lot.specVersionId) });
  const dims = await db.select().from(dimensionSpecs).where(eq(dimensionSpecs.specVersionId, lot.specVersionId));
  const dimById = new Map(dims.map((d) => [d.id, d]));
  const pcs = await db.select().from(pieces).where(eq(pieces.lotId, lotId));
  const pieceBySeq = new Map(pcs.map((p) => [p.seqNo, p]));

  const skipped: string[] = [];
  let written = 0;
  const touched = new Set<number>();
  const now = new Date().toISOString();

  for (const f of payload.files) {
    for (const r of f.readings) {
      const dimId = payload.mapping[r.key];
      if (!dimId) { continue; } // 未對應的特性直接略過(不算錯)
      const dim = dimById.get(dimId);
      if (!dim) { skipped.push(`${f.fileName}:${r.key} 項次不存在`); continue; }
      if (isAttributeGauge(dim.gauge)) { skipped.push(`${f.fileName}:${r.key} 對到塞規項次,略過`); continue; }
      const piece = pieceBySeq.get(r.pieceSeq);
      if (!piece) { skipped.push(`${f.fileName}:${r.key} 件號 #${r.pieceSeq} 不在本批(批量 ${lot.quantity})`); continue; }
      if (!Number.isFinite(r.actual)) { skipped.push(`${f.fileName}:${r.key} 實測值不是數字`); continue; }
      const existing = await db.query.measurements.findFirst({ where: and(eq(measurements.pieceId, piece.id), eq(measurements.dimensionSpecId, dimId)) });
      if (existing && existing.source !== "cmm_import" && !payload.overwriteManual) { skipped.push(`#${r.pieceSeq} ${dim.name} 已有手工值,保留`); continue; }
      const j = judgeDimension(dim, r.actual, spec?.warnRatio ?? 0.8);
      await db
        .insert(measurements)
        .values({ pieceId: piece.id, dimensionSpecId: dimId, value: r.actual, attribute: null, judgement: j.judgement, source: "cmm_import", measuredAt: now })
        .onConflictDoUpdate({ target: [measurements.pieceId, measurements.dimensionSpecId], set: { value: r.actual, attribute: null, judgement: j.judgement, source: "cmm_import", measuredAt: now } });
      written++;
      touched.add(piece.id);
    }
  }

  // 重判有動到的件
  if (touched.size) {
    const ids = [...touched];
    const meas = await db.select().from(measurements).where(inArray(measurements.pieceId, ids));
    const { visualFindings } = await import("@/db/schema");
    const finds = await db.select().from(visualFindings).where(inArray(visualFindings.pieceId, ids));
    for (const pid of ids) {
      const v = judgePiece({ inspectionType: lot.inspectionType, dimensionSpecs: dims, measurements: meas.filter((m) => m.pieceId === pid), findings: finds.filter((x) => x.pieceId === pid) });
      await db.update(pieces).set({ engineVerdict: v.verdict, updatedAt: now }).where(eq(pieces.id, pid));
    }
  }

  // 存對應,下次自動用
  for (const [key, dimId] of Object.entries(payload.mapping)) {
    if (!dimId) continue;
    await db
      .insert(cmmFeatureMaps)
      .values({ specVersionId: lot.specVersionId, featureKey: key, dimensionSpecId: dimId, updatedAt: now })
      .onConflictDoUpdate({ target: [cmmFeatureMaps.specVersionId, cmmFeatureMaps.featureKey], set: { dimensionSpecId: dimId, updatedAt: now } });
  }
  for (const f of payload.files) {
    await db.insert(cmmImports).values({ lotId, fileName: f.fileName, encoding: f.encoding, pieceCount: new Set(f.readings.map((r) => r.pieceSeq)).size, measurementCount: f.readings.filter((r) => payload.mapping[r.key]).length, skipped: skipped.length ? JSON.stringify(skipped.slice(0, 50)) : null });
  }
  await audit("lot", lotId, "cmm_import", { files: payload.files.map((f) => f.fileName), written, skipped: skipped.length });
  revalidatePath(`/lots/${lotId}`);
  return { ok: true, written, skipped, pieces: touched.size };
}
