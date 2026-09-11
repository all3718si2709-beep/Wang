/**
 * 外觀判定。
 * 規則:
 *  - 查 (defectCode, zone) 的允收設定;查不到 → REVIEW(規格未定義,由人決定)
 *  - allowed=false → NG
 *  - allowed=true:size > maxSize → NG;同區同類累計 count > maxCount → NG;否則 OK
 */
export type VisualJudgement = "OK" | "NG" | "REVIEW";

export interface VisualSpecLike {
  defectCode: string;
  zone: string;
  allowed: boolean;
  maxSizeMm: number | null;
  maxCount: number | null;
}

export interface FindingLike {
  defectCode: string;
  zone: string;
  sizeMm: number | null;
  count: number;
}

export interface VisualResult {
  judgement: VisualJudgement;
  reason: string;
}

export function findVisualSpec(specs: VisualSpecLike[], defectCode: string, zone: string) {
  return specs.find((s) => s.defectCode === defectCode && s.zone === zone);
}

/**
 * @param finding 要判的這一筆
 * @param siblings 同一件上其他已存在的發現(用來累計數量)
 */
export function judgeFinding(specs: VisualSpecLike[], finding: FindingLike, siblings: FindingLike[] = []): VisualResult {
  const spec = findVisualSpec(specs, finding.defectCode, finding.zone);
  if (!spec) return { judgement: "REVIEW", reason: "此缺陷於此區域未定義允收標準" };
  if (!spec.allowed) return { judgement: "NG", reason: "此區域不允許此類缺陷" };
  if (spec.maxSizeMm != null) {
    if (finding.sizeMm == null) return { judgement: "REVIEW", reason: `需填缺陷尺寸(上限 ${spec.maxSizeMm} mm)` };
    if (finding.sizeMm > spec.maxSizeMm) return { judgement: "NG", reason: `尺寸 ${finding.sizeMm} mm 超過上限 ${spec.maxSizeMm} mm` };
  }
  if (spec.maxCount != null) {
    const total =
      finding.count +
      siblings
        .filter((s) => s.defectCode === finding.defectCode && s.zone === finding.zone)
        .reduce((a, s) => a + s.count, 0);
    if (total > spec.maxCount) return { judgement: "NG", reason: `同區累計 ${total} 個,超過上限 ${spec.maxCount} 個` };
  }
  return { judgement: "OK", reason: "允收範圍內" };
}
