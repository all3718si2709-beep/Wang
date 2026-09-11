/** 領域常數:MSS SP-55 缺陷分類、檢驗區域、量具、頻率 */

export type Responsibility = "supplier" | "inhouse";

export interface DefectCode {
  code: string;
  nameZh: string;
  nameEn: string;
  /** 預設責任歸屬 */
  responsibility: Responsibility;
  /** 本廠常見 */
  common?: boolean;
  /** 是否屬 MSS SP-55 原始分類 */
  sp55: boolean;
}

export const DEFECT_CODES: DefectCode[] = [
  { code: "I", nameZh: "熱裂 / 裂紋", nameEn: "Hot tears, cracks", responsibility: "supplier", sp55: true },
  { code: "II", nameZh: "縮孔", nameEn: "Shrinkage", responsibility: "supplier", sp55: true },
  { code: "III", nameZh: "夾砂 / 砂孔", nameEn: "Sand inclusions", responsibility: "supplier", common: true, sp55: true },
  { code: "IV", nameZh: "氣孔", nameEn: "Gas porosity", responsibility: "supplier", common: true, sp55: true },
  { code: "V", nameZh: "脈紋", nameEn: "Veining", responsibility: "supplier", sp55: true },
  { code: "VI", nameZh: "鼠尾", nameEn: "Rat tails", responsibility: "supplier", sp55: true },
  { code: "VII", nameZh: "皺皮 / 摺疊", nameEn: "Wrinkles, laps, folds", responsibility: "supplier", sp55: true },
  { code: "VIII", nameZh: "冷隔", nameEn: "Cold shuts", responsibility: "supplier", sp55: true },
  { code: "IX", nameZh: "結疤", nameEn: "Scabs", responsibility: "supplier", sp55: true },
  { code: "X", nameZh: "撐釘痕", nameEn: "Chaplets", responsibility: "supplier", sp55: true },
  { code: "XI", nameZh: "補焊區", nameEn: "Weld repair areas", responsibility: "supplier", sp55: true },
  { code: "XII", nameZh: "表面粗糙", nameEn: "Surface roughness", responsibility: "supplier", sp55: true },
  { code: "R", nameZh: "鏽蝕", nameEn: "Rust / corrosion", responsibility: "inhouse", common: true, sp55: false },
  { code: "M", nameZh: "加工刮傷 / 碰傷", nameEn: "Machining damage", responsibility: "inhouse", sp55: false },
  { code: "AI", nameZh: "AI 偵測異常(待分類)", nameEn: "AI-detected anomaly", responsibility: "supplier", sp55: false },
];

export const defectByCode = (code: string) => DEFECT_CODES.find((d) => d.code === code);

export interface Zone {
  code: string;
  nameZh: string;
  /** 預設嚴格度說明 */
  hint: string;
}

export const ZONES: Zone[] = [
  { code: "sealing_face", nameZh: "密封面", hint: "與閥座/閥板接觸面,最嚴" },
  { code: "end_face_a", nameZh: "端面 A", hint: "加工面" },
  { code: "end_face_b", nameZh: "端面 B", hint: "加工面" },
  { code: "outer_dia", nameZh: "外圓", hint: "加工面" },
  { code: "bore", nameZh: "內孔", hint: "加工面" },
  { code: "unmachined", nameZh: "非加工面", hint: "鑄造原貌,依 SP-55 比對板" },
];

export const zoneByCode = (code: string) => ZONES.find((z) => z.code === code);

export const GAUGES: Record<string, { nameZh: string; defaultDecimals: number; source: "cmm_import" | "bluetooth" | "manual"; attribute?: boolean }> = {
  cmm: { nameZh: "三次元", defaultDecimals: 3, source: "cmm_import" },
  micrometer: { nameZh: "分厘卡", defaultDecimals: 3, source: "bluetooth" },
  height_gauge: { nameZh: "高度規", defaultDecimals: 2, source: "bluetooth" },
  caliper: { nameZh: "游標卡尺", defaultDecimals: 2, source: "bluetooth" },
  /** 屬性量具:只有通 / 不通,沒有數值 */
  plug_gauge: { nameZh: "塞規 / 環規", defaultDecimals: 2, source: "manual", attribute: true },
  other: { nameZh: "其他", defaultDecimals: 2, source: "manual" },
};

export const isAttributeGauge = (gauge: string) => !!GAUGES[gauge]?.attribute;

export const FREQUENCIES: Record<string, string> = {
  each: "每件",
  first: "首件",
  sample: "抽檢",
  first_last: "首末件",
};

export const INSPECTION_TYPES: Record<string, { nameZh: string; desc: string }> = {
  IQC: { nameZh: "進料檢驗", desc: "毛胚進廠,加工前" },
  IPQC: { nameZh: "製程巡檢", desc: "加工中" },
  FQC: { nameZh: "最終檢驗", desc: "出貨前全檢" },
  FAI: { nameZh: "首件檢驗", desc: "全尺寸" },
};

export const VERDICT_LABEL: Record<string, string> = {
  OK: "允收",
  NG: "拒收",
  WARN: "警戒",
  REVIEW: "待複判",
  PENDING: "未完成",
};

export const DISPOSITION_LABEL: Record<string, string> = {
  scrap: "報廢",
  rework: "重工",
  return_supplier: "退回供應商",
  use_as_is: "特採",
};

export const LOT_DISPOSITION_LABEL: Record<string, string> = {
  accept: "允收",
  reject: "拒收",
  deviation: "特採",
};
