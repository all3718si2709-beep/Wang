import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

/** 客戶 */
export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(now),
});

/** 毛胚供應商(上游鑄造廠) */
export const suppliers = sqliteTable("suppliers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(now),
});

/** 料號 */
export const parts = sqliteTable(
  "parts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    customerId: integer("customer_id").notNull().references(() => customers.id),
    partNo: text("part_no").notNull(),
    name: text("name").notNull(),
    drawingNo: text("drawing_no"),
    drawingRev: text("drawing_rev"),
    /** 標稱尺寸(吋),例如 6、8、10 */
    nominalSizeInch: real("nominal_size_inch"),
    material: text("material"),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("parts_customer_partno").on(t.customerId, t.partNo)],
);

/** 允收標準版本:draft 可編、active 生效、retired 停用。active/retired 不可改,要改就開新版 */
export const specVersions = sqliteTable("spec_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partId: integer("part_id").notNull().references(() => parts.id),
  version: integer("version").notNull(),
  status: text("status", { enum: ["draft", "active", "retired"] }).notNull().default("draft"),
  /** 尺寸警戒線:用掉公差帶多少比例就標黃(0~1) */
  warnRatio: real("warn_ratio").notNull().default(0.8),
  notes: text("notes"),
  activatedAt: text("activated_at"),
  retiredAt: text("retired_at"),
  createdAt: text("created_at").notNull().default(now),
});

/** 尺寸項次 */
export const dimensionSpecs = sqliteTable(
  "dimension_specs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    specVersionId: integer("spec_version_id").notNull().references(() => specVersions.id),
    seq: integer("seq").notNull(),
    name: text("name").notNull(),
    drawingRef: text("drawing_ref"),
    nominal: real("nominal").notNull(),
    /** 下公差,存為負數或 0,例如 -0.05 */
    tolMinus: real("tol_minus").notNull(),
    /** 上公差,存為正數或 0,例如 +0.05 */
    tolPlus: real("tol_plus").notNull(),
    unit: text("unit").notNull().default("mm"),
    /** 量具:決定資料怎麼進來 */
    gauge: text("gauge", { enum: ["cmm", "micrometer", "height_gauge", "caliper", "plug_gauge", "other"] }).notNull(),
    /** 頻率:each 每件 / first 首件 / sample 抽檢(三次元) / first_last 首末件 */
    frequency: text("frequency", { enum: ["each", "first", "sample", "first_last"] }).notNull().default("each"),
    /** 關鍵特性(CTQ) */
    critical: integer("critical", { mode: "boolean" }).notNull().default(false),
    /** 顯示小數位 */
    decimals: integer("decimals").notNull().default(2),
  },
  (t) => [index("dimspec_version").on(t.specVersionId)],
);

/**
 * 外觀允收:缺陷代號 × 區域。
 * 沒有列的組合 = 未定義 → 引擎判「待複判」。
 */
export const visualSpecs = sqliteTable(
  "visual_specs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    specVersionId: integer("spec_version_id").notNull().references(() => specVersions.id),
    defectCode: text("defect_code").notNull(),
    zone: text("zone").notNull(),
    allowed: integer("allowed", { mode: "boolean" }).notNull().default(false),
    /** 允收時單一缺陷最大尺寸(mm),null = 不限 */
    maxSizeMm: real("max_size_mm"),
    /** 允收時同區同類最多幾個,null = 不限 */
    maxCount: integer("max_count"),
  },
  (t) => [uniqueIndex("visualspec_unique").on(t.specVersionId, t.defectCode, t.zone)],
);

/** 檢驗批 */
export const lots = sqliteTable(
  "lots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    lotNo: text("lot_no").notNull().unique(),
    partId: integer("part_id").notNull().references(() => parts.id),
    specVersionId: integer("spec_version_id").notNull().references(() => specVersions.id),
    inspectionType: text("inspection_type", { enum: ["IQC", "IPQC", "FQC", "FAI"] }).notNull(),
    erpWorkOrder: text("erp_work_order"),
    erpPoNo: text("erp_po_no"),
    supplierId: integer("supplier_id").references(() => suppliers.id),
    heatNo: text("heat_no"),
    quantity: integer("quantity").notNull(),
    inspector: text("inspector"),
    status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
    /** 批結論:由人決定 */
    disposition: text("disposition", { enum: ["accept", "reject", "deviation"] }),
    notes: text("notes"),
    createdAt: text("created_at").notNull().default(now),
    closedAt: text("closed_at"),
  },
  (t) => [index("lots_part").on(t.partId), index("lots_created").on(t.createdAt)],
);

/** 件 */
export const pieces = sqliteTable(
  "pieces",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    lotId: integer("lot_id").notNull().references(() => lots.id),
    seqNo: integer("seq_no").notNull(),
    /** 序號/刻字(選) */
    serial: text("serial"),
    /** 引擎判定快照 */
    engineVerdict: text("engine_verdict", { enum: ["OK", "NG", "REVIEW", "PENDING"] }).notNull().default("PENDING"),
    /** 人工覆判(選) */
    finalVerdict: text("final_verdict", { enum: ["OK", "NG"] }),
    finalReason: text("final_reason"),
    /** NG 處置 */
    disposition: text("disposition", { enum: ["scrap", "rework", "return_supplier", "use_as_is"] }),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [uniqueIndex("pieces_lot_seq").on(t.lotId, t.seqNo)],
);

/** 尺寸量測值(每件每項最多一筆,重量覆蓋) */
export const measurements = sqliteTable(
  "measurements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pieceId: integer("piece_id").notNull().references(() => pieces.id),
    dimensionSpecId: integer("dimension_spec_id").notNull().references(() => dimensionSpecs.id),
    /** 數值量具:量測值。屬性量具(塞規 / 環規):GO=1、NO-GO=0(統計時排除) */
    value: real("value").notNull(),
    /** 屬性量測:go 通 / nogo 不通;數值量測為 null */
    attribute: text("attribute", { enum: ["go", "nogo"] }),
    judgement: text("judgement", { enum: ["OK", "WARN", "NG"] }).notNull(),
    source: text("source", { enum: ["manual", "bluetooth", "cmm_import"] }).notNull().default("manual"),
    measuredAt: text("measured_at").notNull().default(now),
  },
  (t) => [uniqueIndex("meas_piece_dim").on(t.pieceId, t.dimensionSpecId)],
);

/** 外觀發現 */
export const visualFindings = sqliteTable(
  "visual_findings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    pieceId: integer("piece_id").notNull().references(() => pieces.id),
    defectCode: text("defect_code").notNull(),
    zone: text("zone").notNull(),
    /** 時鐘方位 1~12 */
    clockPosition: integer("clock_position"),
    sizeMm: real("size_mm"),
    count: integer("count").notNull().default(1),
    photoPath: text("photo_path"),
    /** 責任歸屬:上游 / 廠內 */
    responsibility: text("responsibility", { enum: ["supplier", "inhouse"] }).notNull(),
    judgement: text("judgement", { enum: ["OK", "NG", "REVIEW"] }).notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("finding_piece").on(t.pieceId)],
);

/** 三次元特性名稱 ↔ 尺寸項次 對應(每個規格版本存一份,下次自動用) */
export const cmmFeatureMaps = sqliteTable(
  "cmm_feature_maps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    specVersionId: integer("spec_version_id").notNull().references(() => specVersions.id),
    featureKey: text("feature_key").notNull(),
    dimensionSpecId: integer("dimension_spec_id").notNull().references(() => dimensionSpecs.id),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => [uniqueIndex("cmm_map_unique").on(t.specVersionId, t.featureKey)],
);

/** 三次元匯入紀錄(追溯:哪個檔、幾件、幾筆) */
export const cmmImports = sqliteTable("cmm_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lotId: integer("lot_id").notNull().references(() => lots.id),
  fileName: text("file_name").notNull(),
  encoding: text("encoding"),
  pieceCount: integer("piece_count").notNull(),
  measurementCount: integer("measurement_count").notNull(),
  skipped: text("skipped"),
  createdAt: text("created_at").notNull().default(now),
});

/** 系統設定(公司抬頭等,單列 key-value) */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** 稽核紀錄:誰在什麼時候改了規格 / 覆判 */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entity: text("entity").notNull(),
    entityId: integer("entity_id").notNull(),
    action: text("action").notNull(),
    detail: text("detail"),
    actor: text("actor"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("audit_entity").on(t.entity, t.entityId)],
);

export type Customer = typeof customers.$inferSelect;
export type Supplier = typeof suppliers.$inferSelect;
export type Part = typeof parts.$inferSelect;
export type SpecVersion = typeof specVersions.$inferSelect;
export type DimensionSpec = typeof dimensionSpecs.$inferSelect;
export type VisualSpec = typeof visualSpecs.$inferSelect;
export type Lot = typeof lots.$inferSelect;
export type Piece = typeof pieces.$inferSelect;
export type Measurement = typeof measurements.$inferSelect;
export type VisualFinding = typeof visualFindings.$inferSelect;
