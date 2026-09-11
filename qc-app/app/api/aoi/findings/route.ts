/**
 * AOI 結果匯入:aoi/infer.py 的 results.json → 該批各件的外觀發現(缺陷代號 AI,引擎會判「待複判」由人確認)。
 * POST /api/aoi/findings
 * { lotNo, items: [{ seqNo, zone, verdict, score, regions: [{ equiv_diam_px, mm?, cx, cy, peak }], panelPng?: base64 }] }
 */
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import path from "node:path";
import fs from "node:fs/promises";
import { db, ensureMigrated } from "@/db";
import { lots, pieces, visualFindings, visualSpecs } from "@/db/schema";
import { judgeFinding } from "@/lib/engine";
import { ZONES } from "@/lib/domain";
import { revalidatePath } from "next/cache";

const PHOTO_DIR = path.join(process.cwd(), "data", "photos");

export async function POST(req: Request) {
  await ensureMigrated();
  const body = await req.json().catch(() => null);
  if (!body?.lotNo || !Array.isArray(body.items)) return NextResponse.json({ error: "需要 lotNo 與 items" }, { status: 400 });
  const lot = await db.query.lots.findFirst({ where: eq(lots.lotNo, body.lotNo) });
  if (!lot) return NextResponse.json({ error: "批號不存在" }, { status: 404 });
  if (lot.status === "closed") return NextResponse.json({ error: "批已結" }, { status: 409 });
  const visuals = await db.select().from(visualSpecs).where(eq(visualSpecs.specVersionId, lot.specVersionId));

  let created = 0;
  const skipped: string[] = [];
  for (const it of body.items) {
    if (it.verdict !== "NG") continue; // OK 件不產生發現
    const zone = ZONES.some((z) => z.code === it.zone) ? it.zone : "unmachined";
    const piece = await db.query.pieces.findFirst({ where: and(eq(pieces.lotId, lot.id), eq(pieces.seqNo, Number(it.seqNo))) });
    if (!piece) { skipped.push(`#${it.seqNo} 不存在`); continue; }
    let photoPath: string | null = null;
    if (typeof it.panelPng === "string" && it.panelPng.length > 0) {
      const rel = `${lot.id}/${piece.id}-aoi-${Date.now()}.png`;
      await fs.mkdir(path.join(PHOTO_DIR, String(lot.id)), { recursive: true });
      await fs.writeFile(path.join(PHOTO_DIR, rel), Buffer.from(it.panelPng, "base64"));
      photoPath = rel;
    }
    const regs: { equiv_diam_px?: number; mm?: number; cx?: number; cy?: number; peak?: number }[] = Array.isArray(it.regions) ? it.regions : [];
    const largestRaw = regs.reduce<number | null>((m, r) => (r.mm != null ? Math.max(m ?? 0, r.mm) : m), null);
    const largest = largestRaw == null ? null : Math.round(largestRaw * 100) / 100;
    const siblings = await db.select().from(visualFindings).where(eq(visualFindings.pieceId, piece.id));
    const r = judgeFinding(visuals, { defectCode: "AI", zone, sizeMm: largest, count: Math.max(1, regs.length) }, siblings);
    await db.insert(visualFindings).values({
      pieceId: piece.id, defectCode: "AI", zone, sizeMm: largest, count: Math.max(1, regs.length), photoPath,
      responsibility: "supplier", judgement: r.judgement,
      note: `AI 分數 ${Number(it.score).toFixed(2)};區域 ${regs.map((x) => `(${Math.round(x.cx ?? 0)},${Math.round(x.cy ?? 0)}) ${x.mm != null ? x.mm.toFixed(2) + "mm" : Math.round(x.equiv_diam_px ?? 0) + "px"}`).join("、") || "—"}`,
    });
    // 件判定重算:有 REVIEW/NG 發現 → 至少 REVIEW
    const cur = piece.engineVerdict;
    const next = r.judgement === "NG" ? "NG" : cur === "NG" ? "NG" : "REVIEW";
    if (next !== cur) await db.update(pieces).set({ engineVerdict: next, updatedAt: new Date().toISOString() }).where(eq(pieces.id, piece.id));
    created++;
  }
  revalidatePath(`/lots/${lot.id}`);
  return NextResponse.json({ ok: true, lotId: lot.id, created, skipped });
}
