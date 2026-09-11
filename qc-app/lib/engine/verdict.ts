/**
 * 件的綜合判定。
 *  NG      任一尺寸 NG 或任一外觀 NG
 *  REVIEW  無 NG,但有外觀 REVIEW
 *  PENDING 無 NG/REVIEW,但必量尺寸尚未量完
 *  OK      其餘
 * 必量尺寸:FAI 批全部項次;其他批只算 frequency=each 的項次
 */
export type PieceVerdict = "OK" | "NG" | "REVIEW" | "PENDING";

export interface VerdictInput {
  inspectionType: "IQC" | "IPQC" | "FQC" | "FAI";
  dimensionSpecs: { id: number; frequency: string }[];
  measurements: { dimensionSpecId: number; judgement: "OK" | "WARN" | "NG" }[];
  findings: { judgement: "OK" | "NG" | "REVIEW" }[];
}

export interface VerdictResult {
  verdict: PieceVerdict;
  requiredDimIds: number[];
  missingDimIds: number[];
  ngDimCount: number;
  warnDimCount: number;
  ngFindingCount: number;
  reviewFindingCount: number;
}

export function requiredDimensionIds(inspectionType: VerdictInput["inspectionType"], specs: VerdictInput["dimensionSpecs"]) {
  if (inspectionType === "FAI") return specs.map((s) => s.id);
  return specs.filter((s) => s.frequency === "each").map((s) => s.id);
}

export function judgePiece(input: VerdictInput): VerdictResult {
  const requiredDimIds = requiredDimensionIds(input.inspectionType, input.dimensionSpecs);
  const measured = new Set(input.measurements.map((m) => m.dimensionSpecId));
  const missingDimIds = requiredDimIds.filter((id) => !measured.has(id));
  const ngDimCount = input.measurements.filter((m) => m.judgement === "NG").length;
  const warnDimCount = input.measurements.filter((m) => m.judgement === "WARN").length;
  const ngFindingCount = input.findings.filter((f) => f.judgement === "NG").length;
  const reviewFindingCount = input.findings.filter((f) => f.judgement === "REVIEW").length;

  let verdict: PieceVerdict;
  if (ngDimCount > 0 || ngFindingCount > 0) verdict = "NG";
  else if (reviewFindingCount > 0) verdict = "REVIEW";
  else if (missingDimIds.length > 0) verdict = "PENDING";
  else verdict = "OK";

  return { verdict, requiredDimIds, missingDimIds, ngDimCount, warnDimCount, ngFindingCount, reviewFindingCount };
}
