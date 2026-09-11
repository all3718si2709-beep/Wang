/**
 * 三次元特性 ↔ 規格項次 自動對應。
 * 分數:名稱完全相同 > 名稱包含 > 圖面位置代號相同 > 標稱值相同(±1 個最小刻度)。
 * 對不到就留空,由人選;選過的會存起來,下次同規格版本自動用。
 */
export interface DimLike {
  id: number;
  seq: number;
  name: string;
  drawingRef: string | null;
  nominal: number;
  decimals: number;
  gauge: string;
}

export interface MatchResult {
  dimensionSpecId: number | null;
  confidence: "saved" | "high" | "medium" | "low" | "none";
  reason: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-()（）:：]/g, "");

export function matchFeature(key: string, nominal: number | null, dims: DimLike[], saved: Record<string, number>): MatchResult {
  if (saved[key] && dims.some((d) => d.id === saved[key])) return { dimensionSpecId: saved[key], confidence: "saved", reason: "上次的對應" };
  const k = norm(key);
  const feature = norm(key.split(".")[0]);
  // 名稱完全相同
  for (const d of dims) if (norm(d.name) === k || norm(d.name) === feature) return { dimensionSpecId: d.id, confidence: "high", reason: "名稱相同" };
  // 名稱互相包含
  for (const d of dims) {
    const n = norm(d.name);
    if (n.length >= 2 && (k.includes(n) || n.includes(feature) && feature.length >= 2)) return { dimensionSpecId: d.id, confidence: "medium", reason: `名稱包含「${d.name}」` };
  }
  // 圖面位置代號(例如 A、B、DIM_A_OD):保留分隔符當邊界
  const raw = key.split(".")[0].toLowerCase().replace(/\s/g, ""); // 去掉軸尾碼(.D / .X),免得 D 軸被當成圖面 D
  for (const d of dims) {
    if (!d.drawingRef) continue;
    const ref = d.drawingRef.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!ref) continue;
    if (raw === ref || new RegExp(`(^|[^a-z0-9])${ref}([^a-z0-9]|$)`).test(raw)) return { dimensionSpecId: d.id, confidence: "medium", reason: `圖面位置 ${d.drawingRef}` };
  }
  // 標稱值相同(只有唯一一個項次符合才算)
  if (nominal != null) {
    const hits = dims.filter((d) => d.gauge === "cmm" && Math.abs(d.nominal - nominal) <= Math.pow(10, -d.decimals) * 1.5);
    const hits2 = hits.length ? hits : dims.filter((d) => Math.abs(d.nominal - nominal) <= Math.pow(10, -d.decimals) * 1.5);
    if (hits2.length === 1) return { dimensionSpecId: hits2[0].id, confidence: "low", reason: `標稱 ${nominal} 相同` };
    if (hits2.length > 1) return { dimensionSpecId: null, confidence: "none", reason: `標稱 ${nominal} 有 ${hits2.length} 個項次符合,請選` };
  }
  return { dimensionSpecId: null, confidence: "none", reason: "對不到,請選" };
}
