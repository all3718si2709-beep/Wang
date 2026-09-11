/**
 * 示範資料:一個客戶、一個供應商、一個 8 吋料號含 active 規格、一個進行中的 FQC 批。
 * 執行:pnpm db:seed(只在空庫執行,已有資料就跳過)
 */
import { db, ensureMigrated } from "./index";
import { customers, suppliers, parts, specVersions, dimensionSpecs, visualSpecs, lots, pieces, settings } from "./schema";
import { DEFECT_CODES, ZONES } from "../lib/domain";

async function main() {
  await ensureMigrated();
  const existing = await db.select().from(customers).limit(1);
  if (existing.length) {
    console.log("資料庫已有資料,跳過 seed");
    return;
  }

  await db.insert(settings).values([
    { key: "company.name", value: "（請至設定填入公司名稱）" },
    { key: "company.address", value: "" },
    { key: "company.phone", value: "" },
  ]);

  const [cust] = await db.insert(customers).values({ code: "C001", name: "示範客戶股份有限公司" }).returning();
  const [sup] = await db.insert(suppliers).values({ code: "S001", name: "示範鑄造廠" }).returning();

  const [part] = await db
    .insert(parts)
    .values({
      customerId: cust.id,
      partNo: "VD-8-150",
      name: "8\" 閥板 Class 150",
      drawingNo: "DWG-VD-8-150",
      drawingRev: "B",
      nominalSizeInch: 8,
      material: "ASTM A216 WCB",
    })
    .returning();

  const [spec] = await db
    .insert(specVersions)
    .values({ partId: part.id, version: 1, status: "active", activatedAt: new Date().toISOString(), notes: "示範規格" })
    .returning();

  const dims: (typeof dimensionSpecs.$inferInsert)[] = [
    { specVersionId: spec.id, seq: 1, name: "外徑", drawingRef: "A", nominal: 203.2, tolMinus: -0.1, tolPlus: 0.1, gauge: "cmm", frequency: "sample", critical: true, decimals: 3 },
    { specVersionId: spec.id, seq: 2, name: "總厚", drawingRef: "B", nominal: 38.0, tolMinus: -0.1, tolPlus: 0.1, gauge: "micrometer", frequency: "each", critical: true, decimals: 3 },
    { specVersionId: spec.id, seq: 3, name: "內孔直徑", drawingRef: "C", nominal: 120.0, tolMinus: 0, tolPlus: 0.05, gauge: "cmm", frequency: "sample", critical: true, decimals: 3 },
    { specVersionId: spec.id, seq: 4, name: "密封面高度", drawingRef: "D", nominal: 6.0, tolMinus: -0.05, tolPlus: 0.05, gauge: "height_gauge", frequency: "each", critical: true, decimals: 2 },
    { specVersionId: spec.id, seq: 5, name: "軸孔直徑", drawingRef: "E", nominal: 32.0, tolMinus: 0, tolPlus: 0.025, gauge: "plug_gauge", frequency: "each", decimals: 3 },
    { specVersionId: spec.id, seq: 6, name: "鍵槽寬", drawingRef: "F", nominal: 10.0, tolMinus: 0, tolPlus: 0.036, gauge: "caliper", frequency: "each", decimals: 3 },
    { specVersionId: spec.id, seq: 7, name: "螺栓孔 PCD", drawingRef: "G", nominal: 190.5, tolMinus: -0.2, tolPlus: 0.2, gauge: "cmm", frequency: "first", decimals: 2 },
    { specVersionId: spec.id, seq: 8, name: "螺栓孔直徑", drawingRef: "H", nominal: 19.0, tolMinus: 0, tolPlus: 0.2, gauge: "caliper", frequency: "each", decimals: 2 },
    { specVersionId: spec.id, seq: 9, name: "端面平行度", drawingRef: "I", nominal: 0, tolMinus: 0, tolPlus: 0.05, gauge: "cmm", frequency: "sample", decimals: 3 },
    { specVersionId: spec.id, seq: 10, name: "外圓同心度", drawingRef: "J", nominal: 0, tolMinus: 0, tolPlus: 0.05, gauge: "cmm", frequency: "sample", decimals: 3 },
    { specVersionId: spec.id, seq: 11, name: "倒角", drawingRef: "K", nominal: 1.0, tolMinus: -0.2, tolPlus: 0.2, gauge: "caliper", frequency: "first_last", decimals: 1 },
    { specVersionId: spec.id, seq: 12, name: "密封面粗糙度 Ra", drawingRef: "L", nominal: 0, tolMinus: 0, tolPlus: 1.6, unit: "μm", gauge: "other", frequency: "sample", decimals: 2 },
  ];
  await db.insert(dimensionSpecs).values(dims);

  // 外觀:密封面一律不允收;加工面允許小氣孔/夾砂;鏽蝕任何加工面不允收;非加工面較寬
  const vs: (typeof visualSpecs.$inferInsert)[] = [];
  for (const d of DEFECT_CODES) {
    for (const z of ZONES) {
      let allowed = false;
      let maxSizeMm: number | null = null;
      let maxCount: number | null = null;
      if (z.code === "sealing_face") {
        allowed = false;
      } else if (z.code === "unmachined") {
        if (["III", "IV", "V", "VI", "VII", "XII"].includes(d.code)) { allowed = true; maxSizeMm = 1.5; maxCount = 5; }
        if (d.code === "XI") { allowed = true; }
      } else {
        // 一般加工面
        if (["III", "IV"].includes(d.code)) { allowed = true; maxSizeMm = 0.5; maxCount = 2; }
        if (d.code === "M") { allowed = true; maxSizeMm = 0.3; maxCount = 1; }
      }
      vs.push({ specVersionId: spec.id, defectCode: d.code, zone: z.code, allowed, maxSizeMm, maxCount });
    }
  }
  await db.insert(visualSpecs).values(vs);

  const [lot] = await db
    .insert(lots)
    .values({
      lotNo: "L-DEMO-0001",
      partId: part.id,
      specVersionId: spec.id,
      inspectionType: "FQC",
      erpWorkOrder: "WO-2609-0001",
      erpPoNo: "PO-2608-0117",
      supplierId: sup.id,
      heatNo: "H26081",
      quantity: 10,
      inspector: "示範檢驗員",
    })
    .returning();
  await db.insert(pieces).values(Array.from({ length: 10 }, (_, i) => ({ lotId: lot.id, seqNo: i + 1 })));

  console.log("seed 完成:客戶", cust.code, "料號", part.partNo, "批", lot.lotNo);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
