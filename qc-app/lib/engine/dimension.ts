/**
 * 尺寸判定。純函式,無 I/O,前後端共用。
 * 規則:
 *  - 落在 [nominal+tolMinus, nominal+tolPlus] 內為 OK,否則 NG(邊界含)
 *  - OK 但用掉該側公差帶 ≥ warnRatio → WARN(趨勢預警)
 *  - 單邊公差(某側 tol = 0):該側任何偏移即 NG
 *  - 比較前四捨五入到 decimals+1 位,避免浮點誤差把邊界值判錯
 */
export type DimJudgement = "OK" | "WARN" | "NG";

export interface DimSpecLike {
  nominal: number;
  tolMinus: number; // ≤ 0
  tolPlus: number; // ≥ 0
  decimals?: number;
}

export interface DimResult {
  judgement: DimJudgement;
  deviation: number;
  /** 用掉公差帶比例(0~∞),單邊 tol=0 且有偏移時為 Infinity */
  usage: number;
  lower: number;
  upper: number;
}

const roundTo = (v: number, d: number) => {
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
};

export function judgeDimension(spec: DimSpecLike, value: number, warnRatio = 0.8): DimResult {
  if (!Number.isFinite(value)) throw new Error("量測值不是數字");
  if (spec.tolMinus > 0 || spec.tolPlus < 0) throw new Error("公差方向錯誤:下公差應 ≤ 0,上公差應 ≥ 0");
  const d = (spec.decimals ?? 2) + 1;
  const lower = roundTo(spec.nominal + spec.tolMinus, d);
  const upper = roundTo(spec.nominal + spec.tolPlus, d);
  const v = roundTo(value, d);
  const deviation = roundTo(v - spec.nominal, d);

  let usage: number;
  if (deviation === 0) usage = 0;
  else if (deviation > 0) usage = spec.tolPlus === 0 ? Infinity : deviation / spec.tolPlus;
  else usage = spec.tolMinus === 0 ? Infinity : deviation / spec.tolMinus; // 兩負相除為正
  if (Number.isFinite(usage)) usage = roundTo(usage, 6); // 0.04/0.05 = 0.79999… 這種浮點誤差

  let judgement: DimJudgement;
  if (v < lower || v > upper) judgement = "NG";
  else if (usage >= warnRatio) judgement = "WARN";
  else judgement = "OK";

  return { judgement, deviation, usage, lower, upper };
}
