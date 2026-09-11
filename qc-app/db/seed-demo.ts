/**
 * 示範資料(假資料):3 客戶、3 鑄造廠、6 料號(3"~14")、約 14 批橫跨 45 天。
 * 執行:pnpm db:seed-demo   ← 會清空現有資料庫重建!
 * 所有判定都走真正的引擎(judgeDimension / judgeFinding / judgePiece),資料與規則一致。
 */
import fs from "node:fs";
import path from "node:path";
import { db, ensureMigrated } from "./index";
import { customers, suppliers, parts, specVersions, dimensionSpecs, visualSpecs, lots, pieces, measurements, visualFindings, settings, auditLog } from "./schema";
import { DEFECT_CODES, ZONES } from "../lib/domain";
import { judgeDimension, judgeFinding, judgePiece } from "../lib/engine";

// 可重現的亂數
let seed = 20260911;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const gauss = () => { const u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const daysAgo = (d: number, h = 9) => { const t = new Date(); t.setDate(t.getDate() - d); t.setHours(h, Math.floor(rnd() * 50), 0, 0); return t.toISOString(); };
const round = (v: number, d: number) => Number(v.toFixed(d));

async function main() {
  await ensureMigrated();
  // 清空
  for (const t of [auditLog, visualFindings, measurements, pieces, lots, visualSpecs, dimensionSpecs, specVersions, parts, suppliers, customers, settings]) await db.delete(t);
  const photoDir = path.join(process.cwd(), "data", "photos");
  fs.rmSync(photoDir, { recursive: true, force: true });

  await db.insert(settings).values([
    { key: "company.name", value: "示範精密工業股份有限公司" },
    { key: "company.address", value: "台中市大甲區工業區示範路 88 號" },
    { key: "company.phone", value: "04-2688-0000" },
    { key: "report.footer", value: "本報告依開批當時生效之允收標準判定;尺寸量測值取自三次元量測儀與經校正之手工量具。本報告僅對本批送檢樣品負責。" },
  ]);

  const cs = await db.insert(customers).values([
    { code: "C001", name: "台灣閥業股份有限公司", notes: "主力客戶,鑄孔零容忍(密封面)" },
    { code: "C002", name: "Pacific Valve Co. (USA)", notes: "要求 MSS SP-55 + 英文 COC" },
    { code: "C003", name: "東洋バルブ工業", notes: "鏽蝕特別嚴,外圓也不允收" },
  ]).returning();
  const ss = await db.insert(suppliers).values([
    { code: "S001", name: "大甲鑄造廠", notes: "WCB 為主,砂孔率偏高" },
    { code: "S002", name: "彰化精密鑄造", notes: "品質穩,價格高" },
    { code: "S003", name: "越南 Thanh Long Casting", notes: "2026-07 新導入,試用中" },
  ]).returning();

  // ---- 料號與規格 ----
  type DimIn = Omit<typeof dimensionSpecs.$inferInsert, "specVersionId">;
  const partDefs: { customer: number; partNo: string; name: string; inch: number; drawing: string; rev: string; material: string; dims: DimIn[]; strictRust?: boolean }[] = [
    { customer: 0, partNo: "VD-3-150", name: "3\" 閥板 Class 150", inch: 3, drawing: "DWG-VD-3-150", rev: "A", material: "ASTM A216 WCB",
      dims: mkDims(76.2, 22, 45, 16, 5) },
    { customer: 0, partNo: "VD-6-150", name: "6\" 閥板 Class 150", inch: 6, drawing: "DWG-VD-6-150", rev: "C", material: "ASTM A216 WCB",
      dims: mkDims(152.4, 32, 95, 25, 8) },
    { customer: 0, partNo: "VD-8-150", name: "8\" 閥板 Class 150", inch: 8, drawing: "DWG-VD-8-150", rev: "B", material: "ASTM A216 WCB",
      dims: mkDims(203.2, 38, 120, 32, 10) },
    { customer: 1, partNo: "PV-SR-10", name: "10\" Seat Ring", inch: 10, drawing: "PV-10-SR-002", rev: "2", material: "ASTM A351 CF8M",
      dims: mkDims(254, 28, 210, 0, 0, true) },
    { customer: 2, partNo: "TY-FL-12", name: "12\" 閥體法蘭", inch: 12, drawing: "TY-12-FL", rev: "D", material: "FCD450",
      dims: mkDims(304.8, 45, 260, 0, 0, true), strictRust: true },
    { customer: 1, partNo: "PV-DISC-14", name: "14\" Disc", inch: 14, drawing: "PV-14-DISC-001", rev: "1", material: "ASTM A216 WCB",
      dims: mkDims(355.6, 52, 240, 45, 14) },
  ];

  const partRows: { id: number; specId: number; dims: (typeof dimensionSpecs.$inferSelect)[]; visuals: (typeof visualSpecs.$inferSelect)[]; warn: number; def: (typeof partDefs)[number] }[] = [];
  for (const pd of partDefs) {
    const [p] = await db.insert(parts).values({ customerId: cs[pd.customer].id, partNo: pd.partNo, name: pd.name, drawingNo: pd.drawing, drawingRev: pd.rev, nominalSizeInch: pd.inch, material: pd.material }).returning();
    // 8" 有 v1 已停用 + v2 生效(示範版本歷史);14" 另有 v2 草稿
    let version = 1;
    if (pd.partNo === "VD-8-150") {
      const [v1] = await db.insert(specVersions).values({ partId: p.id, version: 1, status: "retired", activatedAt: daysAgo(120), retiredAt: daysAgo(30), notes: "初版" }).returning();
      await db.insert(dimensionSpecs).values(pd.dims.map((d) => ({ ...d, specVersionId: v1.id, tolMinus: d.tolMinus * 1.5, tolPlus: d.tolPlus * 1.5 })));
      await db.insert(visualSpecs).values(mkVisuals(v1.id, false));
      version = 2;
    }
    const [v] = await db.insert(specVersions).values({ partId: p.id, version, status: "active", activatedAt: daysAgo(version === 2 ? 30 : 90), notes: version === 2 ? "客戶 Rev B 圖面收緊總厚與密封面公差" : null }).returning();
    const dims = await db.insert(dimensionSpecs).values(pd.dims.map((d) => ({ ...d, specVersionId: v.id }))).returning();
    const visuals = await db.insert(visualSpecs).values(mkVisuals(v.id, !!pd.strictRust)).returning();
    if (pd.partNo === "PV-DISC-14") {
      const [d2] = await db.insert(specVersions).values({ partId: p.id, version: 2, status: "draft", notes: "草稿:客戶擬放寬非加工面氣孔至 2.0mm" }).returning();
      await db.insert(dimensionSpecs).values(pd.dims.map((d) => ({ ...d, specVersionId: d2.id })));
      await db.insert(visualSpecs).values(mkVisuals(d2.id, false));
    }
    partRows.push({ id: p.id, specId: v.id, dims, visuals, warn: 0.8, def: pd });
  }

  // ---- 批 ----
  const inspectors = ["王小明", "陳美玲", "林志豪"];
  const lotPlans: { part: string; type: "FQC" | "IQC" | "FAI" | "IPQC"; qty: number; day: number; supplier: number; status: "closed" | "open"; disposition?: "accept" | "reject" | "deviation"; shift?: number; ngRate: number; rustRate: number; partial?: number; review?: boolean }[] = [
    { part: "VD-6-150", type: "FQC", qty: 20, day: 44, supplier: 0, status: "closed", disposition: "accept", ngRate: 0.05, rustRate: 0.05 },
    { part: "VD-8-150", type: "FAI", qty: 3, day: 40, supplier: 1, status: "closed", disposition: "accept", ngRate: 0, rustRate: 0 },
    { part: "VD-8-150", type: "FQC", qty: 30, day: 36, supplier: 0, status: "closed", disposition: "deviation", ngRate: 0.1, rustRate: 0.03 },
    { part: "PV-SR-10", type: "FQC", qty: 12, day: 31, supplier: 1, status: "closed", disposition: "accept", ngRate: 0.0, rustRate: 0.0 },
    { part: "TY-FL-12", type: "FQC", qty: 8, day: 27, supplier: 2, status: "closed", disposition: "reject", ngRate: 0.25, rustRate: 0.25 },
    { part: "VD-3-150", type: "FQC", qty: 25, day: 22, supplier: 0, status: "closed", disposition: "accept", ngRate: 0.04, rustRate: 0 },
    { part: "VD-6-150", type: "IQC", qty: 15, day: 18, supplier: 2, status: "closed", disposition: "reject", ngRate: 0.3, rustRate: 0.1 },
    { part: "VD-8-150", type: "FQC", qty: 24, day: 14, supplier: 0, status: "closed", disposition: "accept", ngRate: 0.08, rustRate: 0.04, shift: 0.6 },
    { part: "PV-DISC-14", type: "FAI", qty: 2, day: 10, supplier: 1, status: "closed", disposition: "accept", ngRate: 0, rustRate: 0 },
    { part: "VD-3-150", type: "FQC", qty: 20, day: 7, supplier: 1, status: "closed", disposition: "accept", ngRate: 0.05, rustRate: 0 },
    { part: "TY-FL-12", type: "FQC", qty: 10, day: 4, supplier: 0, status: "open", ngRate: 0.1, rustRate: 0.1, review: true },
    { part: "VD-8-150", type: "FQC", qty: 30, day: 1, supplier: 0, status: "open", ngRate: 0.07, rustRate: 0.03, partial: 0.6, shift: 0.7 },
    { part: "VD-6-150", type: "FQC", qty: 16, day: 0, supplier: 1, status: "open", ngRate: 0.05, rustRate: 0, partial: 0.2 },
    { part: "PV-SR-10", type: "IQC", qty: 12, day: 0, supplier: 2, status: "open", ngRate: 0.15, rustRate: 0.15, partial: 0 },
  ];

  const panelPhotos = fs.existsSync(path.join(process.cwd(), "..", "aoi", "runs", "bridge")) ? fs.readdirSync(path.join(process.cwd(), "..", "aoi", "runs", "bridge")).filter((f) => f.endsWith(".png")) : [];

  let seq = 0;
  for (const lp of lotPlans) {
    const pr = partRows.find((x) => x.def.partNo === lp.part)!;
    seq++;
    const created = daysAgo(lp.day, 8 + Math.floor(rnd() * 6));
    const d = new Date(created);
    const lotNo = `L-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String((seq % 3) + 1).padStart(3, "0")}`;
    const [lot] = await db.insert(lots).values({
      lotNo, partId: pr.id, specVersionId: pr.specId, inspectionType: lp.type,
      erpWorkOrder: lp.type === "IQC" ? null : `WO-26${String(9 - Math.floor(lp.day / 30)).padStart(2, "0")}-${String(1000 + seq * 37).slice(1)}`,
      erpPoNo: `PO-26${String(8 - Math.floor(lp.day / 45)).padStart(2, "0")}-${String(100 + seq * 11).slice(1)}`,
      supplierId: ss[lp.supplier].id, heatNo: `H26${String(lp.day * 3 + 100).slice(-3)}${pick(["A", "B", "C"])}`,
      quantity: lp.qty, inspector: pick(inspectors), status: lp.status, disposition: lp.disposition ?? null,
      createdAt: created, closedAt: lp.status === "closed" ? daysAgo(lp.day, 16) : null,
      notes: lp.disposition === "deviation" ? "客戶同意特採:非密封面小氣孔 3 件,已通知業務" : lp.disposition === "reject" && lp.type === "IQC" ? "毛胚砂孔嚴重,整批退回供應商" : null,
    }).returning();

    const required = lp.type === "FAI" ? pr.dims : pr.dims.filter((x) => x.frequency === "each");
    const measureDims = lp.type === "IQC" ? [] : lp.type === "FAI" ? pr.dims : required;
    const nPieces = lp.qty;
    const measuredCount = lp.partial != null ? Math.round(nPieces * lp.partial) : nPieces;
    const shift = lp.shift ?? 0;

    for (let i = 1; i <= nPieces; i++) {
      const [pc] = await db.insert(pieces).values({ lotId: lot.id, seqNo: i, updatedAt: created }).returning();
      const meas: { dimensionSpecId: number; judgement: "OK" | "WARN" | "NG" }[] = [];
      if (i <= measuredCount) {
        for (const dm of measureDims) {
          const lower = dm.nominal + dm.tolMinus, upper = dm.nominal + dm.tolPlus;
          const half = (upper - lower) / 2;
          const center = (lower + upper) / 2;
          let v: number;
          if (dm.nominal === 0) {
            // 形位公差:只有正值,大多落在 30~60% 帶寬
            v = Math.abs(gauss()) * dm.tolPlus * 0.35 + dm.tolPlus * 0.2;
            if (rnd() < lp.ngRate * 0.15) v = dm.tolPlus * (1.05 + rnd() * 0.3);
          } else {
            const drift = dm.critical ? shift * half : 0; // 刀具磨耗:關鍵尺寸往上飄 → 警戒
            v = center + drift + gauss() * half * 0.22;
            if (rnd() < lp.ngRate * 0.12) v = center + (rnd() < 0.5 ? 1 : -1) * half * (1.05 + rnd() * 0.5); // 偶發超差
            v = Math.min(Math.max(v, lower - half * 0.6), upper + half * 0.6);
          }
          v = round(v, dm.decimals);
          const r = judgeDimension(dm, v, pr.warn);
          meas.push({ dimensionSpecId: dm.id, judgement: r.judgement });
          await db.insert(measurements).values({ pieceId: pc.id, dimensionSpecId: dm.id, value: v, judgement: r.judgement, source: dm.gauge === "cmm" ? "cmm_import" : rnd() < 0.7 ? "bluetooth" : "manual", measuredAt: created });
        }
      }
      // 外觀
      const finds: { judgement: "OK" | "NG" | "REVIEW" }[] = [];
      const existing: { defectCode: string; zone: string; sizeMm: number | null; count: number }[] = [];
      const addFinding = async (code: string, zone: string, size: number | null, count: number, resp: "supplier" | "inhouse", note: string | null, forceReview = false) => {
        const r = judgeFinding(pr.visuals, { defectCode: code, zone, sizeMm: size, count }, existing);
        const judgement = forceReview ? "REVIEW" : r.judgement;
        let photoPath: string | null = null;
        if (panelPhotos.length && rnd() < 0.5) {
          const src = pick(panelPhotos);
          const rel = `${lot.id}/${pc.id}-${Date.now()}-${Math.floor(rnd() * 1e5)}.png`;
          fs.mkdirSync(path.join(photoDir, String(lot.id)), { recursive: true });
          fs.copyFileSync(path.join(process.cwd(), "..", "aoi", "runs", "bridge", src), path.join(photoDir, rel));
          photoPath = rel;
        }
        await db.insert(visualFindings).values({ pieceId: pc.id, defectCode: code, zone, sizeMm: size, count, clockPosition: 1 + Math.floor(rnd() * 12), photoPath, responsibility: resp, judgement, note, createdAt: created });
        existing.push({ defectCode: code, zone, sizeMm: size, count });
        finds.push({ judgement });
      };
      if (i <= Math.max(measuredCount, lp.type === "IQC" ? nPieces * (lp.partial ?? 1) : 0) || lp.type === "IQC") {
        const zonesMach = ["end_face_a", "end_face_b", "outer_dia", "bore"];
        if (rnd() < lp.ngRate * 0.9) {
          const code = rnd() < 0.6 ? "IV" : "III";
          const zone = rnd() < 0.15 ? "sealing_face" : rnd() < 0.35 ? "unmachined" : pick(zonesMach);
          const size = round(0.15 + rnd() * (zone === "unmachined" ? 1.8 : 0.7), 2);
          await addFinding(code, zone, size, 1 + Math.floor(rnd() * 2), "supplier", zone === "sealing_face" ? "密封面不允收,退回供應商" : null);
        }
        if (rnd() < lp.rustRate) {
          await addFinding("R", pick(["outer_dia", "end_face_b", "unmachined"]), null, 1, "inhouse", pick(["加工後停放 6 天", "切削液殘留", "梅雨季倉儲濕度高", null]));
        }
        if (lp.review && i === 4) await addFinding("VII", "bore", 0.4, 1, "supplier", "皺皮,規格未定義,待品管判", true);
        if (lp.review && i === 7) await addFinding("AI", "end_face_a", 1.2, 1, "supplier", "AI 分數 1.62;區域 (183,204) 1.20mm");
        if (rnd() < 0.02) await addFinding("M", pick(zonesMach), round(0.1 + rnd() * 0.4, 2), 1, "inhouse", "夾爪碰傷");
      }
      const v = judgePiece({ inspectionType: lp.type, dimensionSpecs: pr.dims, measurements: meas, findings: finds });
      let engineVerdict = v.verdict;
      // 已結批不能留 PENDING/REVIEW:結批的批補齊或覆判
      let finalVerdict: "OK" | "NG" | null = null, finalReason: string | null = null;
      if (lp.status === "closed" && (engineVerdict === "PENDING" || engineVerdict === "REVIEW")) {
        finalVerdict = engineVerdict === "REVIEW" ? (rnd() < 0.7 ? "OK" : "NG") : "OK";
        finalReason = engineVerdict === "REVIEW" ? "品管主管目視確認,對照 SP-55 比對板" : "IQC 外觀合格,無尺寸項";
        if (lp.type === "IQC" && engineVerdict === "PENDING") { engineVerdict = "OK"; finalVerdict = null; finalReason = null; }
      }
      const eff = finalVerdict ?? engineVerdict;
      const disposition = eff === "NG" ? (finds.some((f) => f.judgement === "NG") ? (rnd() < 0.8 ? "return_supplier" : "scrap") : lp.disposition === "deviation" ? "use_as_is" : (rnd() < 0.6 ? "rework" : "scrap")) : null;
      await db.update(pieces).set({ engineVerdict, finalVerdict, finalReason, disposition: lp.status === "closed" ? disposition : rnd() < 0.5 ? disposition : null, updatedAt: created }).where(pieceEq(pc.id));
    }
  }
  const n = await db.select().from(lots);
  console.log(`示範資料完成:客戶 ${cs.length}、供應商 ${ss.length}、料號 ${partRows.length}、批 ${n.length}`);
}

import { eq } from "drizzle-orm";
const pieceEq = (id: number) => eq(pieces.id, id);

function mkDims(od: number, thick: number, bore: number, shaft: number, key: number, ring = false): Omit<typeof dimensionSpecs.$inferInsert, "specVersionId">[] {
  const dims: Omit<typeof dimensionSpecs.$inferInsert, "specVersionId">[] = [
    { seq: 1, name: "外徑", drawingRef: "A", nominal: od, tolMinus: -0.1, tolPlus: 0.1, gauge: "cmm", frequency: "sample", critical: true, decimals: 3 },
    { seq: 2, name: "總厚", drawingRef: "B", nominal: thick, tolMinus: -0.1, tolPlus: 0.1, gauge: "micrometer", frequency: "each", critical: true, decimals: 3 },
    { seq: 3, name: "內孔直徑", drawingRef: "C", nominal: bore, tolMinus: 0, tolPlus: 0.05, gauge: "cmm", frequency: "sample", critical: true, decimals: 3 },
    { seq: 4, name: "密封面高度", drawingRef: "D", nominal: ring ? 4 : 6, tolMinus: -0.05, tolPlus: 0.05, gauge: "height_gauge", frequency: "each", critical: true, decimals: 2 },
  ];
  let s = 5;
  if (shaft) dims.push({ seq: s++, name: "軸孔直徑", drawingRef: "E", nominal: shaft, tolMinus: 0, tolPlus: 0.025, gauge: "plug_gauge", frequency: "each", decimals: 3 });
  if (key) dims.push({ seq: s++, name: "鍵槽寬", drawingRef: "F", nominal: key, tolMinus: 0, tolPlus: 0.036, gauge: "caliper", frequency: "each", decimals: 3 });
  dims.push(
    { seq: s++, name: "螺栓孔 PCD", drawingRef: "G", nominal: round(od * 0.94, 1), tolMinus: -0.2, tolPlus: 0.2, gauge: "cmm", frequency: "first", decimals: 2 },
    { seq: s++, name: "螺栓孔直徑", drawingRef: "H", nominal: od < 100 ? 16 : od < 300 ? 19 : 22, tolMinus: 0, tolPlus: 0.2, gauge: "caliper", frequency: "each", decimals: 2 },
    { seq: s++, name: "端面平行度", drawingRef: "I", nominal: 0, tolMinus: 0, tolPlus: 0.05, gauge: "cmm", frequency: "sample", decimals: 3 },
    { seq: s++, name: "外圓同心度", drawingRef: "J", nominal: 0, tolMinus: 0, tolPlus: 0.05, gauge: "cmm", frequency: "sample", decimals: 3 },
    { seq: s++, name: "倒角", drawingRef: "K", nominal: 1.0, tolMinus: -0.2, tolPlus: 0.2, gauge: "caliper", frequency: "first_last", decimals: 1 },
    { seq: s++, name: "密封面粗糙度 Ra", drawingRef: "L", nominal: 0, tolMinus: 0, tolPlus: 1.6, unit: "μm", gauge: "other", frequency: "sample", decimals: 2 },
    { seq: s++, name: "法蘭厚", drawingRef: "M", nominal: round(thick * 0.6, 1), tolMinus: -0.15, tolPlus: 0.15, gauge: "caliper", frequency: "each", decimals: 2 },
  );
  return dims;
}

function mkVisuals(specVersionId: number, strictRust: boolean): (typeof visualSpecs.$inferInsert)[] {
  const vs: (typeof visualSpecs.$inferInsert)[] = [];
  for (const d of DEFECT_CODES) for (const z of ZONES) {
    let allowed = false, maxSizeMm: number | null = null, maxCount: number | null = null;
    if (z.code === "sealing_face") allowed = false;
    else if (z.code === "unmachined") {
      if (["III", "IV", "V", "VI", "VII", "XII"].includes(d.code)) { allowed = true; maxSizeMm = 1.5; maxCount = 5; }
      if (d.code === "XI") allowed = true;
      if (d.code === "R" && !strictRust) allowed = true;
    } else {
      if (["III", "IV"].includes(d.code)) { allowed = true; maxSizeMm = 0.5; maxCount = 2; }
      if (d.code === "M") { allowed = true; maxSizeMm = 0.3; maxCount = 1; }
    }
    vs.push({ specVersionId, defectCode: d.code, zone: z.code, allowed, maxSizeMm, maxCount });
  }
  return vs;
}

main().catch((e) => { console.error(e); process.exit(1); });
