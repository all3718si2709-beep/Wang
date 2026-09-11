/** 批次統計:每個尺寸項次的 n / min / max / mean / stdev / Cp / Cpk */
export interface DimStats {
  n: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  stdev: number | null;
  cp: number | null;
  cpk: number | null;
  ok: number;
  warn: number;
  ng: number;
}

export function dimensionStats(
  values: { value: number; judgement: "OK" | "WARN" | "NG" }[],
  spec: { nominal: number; tolMinus: number; tolPlus: number },
): DimStats {
  const n = values.length;
  const base: DimStats = { n, min: null, max: null, mean: null, stdev: null, cp: null, cpk: null, ok: 0, warn: 0, ng: 0 };
  for (const v of values) {
    if (v.judgement === "OK") base.ok++;
    else if (v.judgement === "WARN") base.warn++;
    else base.ng++;
  }
  if (n === 0) return base;
  const xs = values.map((v) => v.value);
  base.min = Math.min(...xs);
  base.max = Math.max(...xs);
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  base.mean = mean;
  if (n < 2) return base;
  const variance = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1);
  const s = Math.sqrt(variance);
  base.stdev = s;
  if (s === 0) return base; // 全部相同值,Cp 無意義(視為無限),回傳 null 讓 UI 顯示「—」
  const lsl = spec.nominal + spec.tolMinus;
  const usl = spec.nominal + spec.tolPlus;
  const bilateral = spec.tolMinus < 0 && spec.tolPlus > 0;
  if (bilateral) {
    base.cp = (usl - lsl) / (6 * s);
    base.cpk = Math.min((usl - mean) / (3 * s), (mean - lsl) / (3 * s));
  } else if (spec.tolPlus > 0) {
    base.cpk = (usl - mean) / (3 * s); // 單邊上限
  } else if (spec.tolMinus < 0) {
    base.cpk = (mean - lsl) / (3 * s); // 單邊下限
  }
  return base;
}
