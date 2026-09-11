import { describe, it, expect } from "vitest";
import { dimensionStats } from "../stats";

const spec = { nominal: 10, tolMinus: -0.1, tolPlus: 0.1 };
const ok = (value: number) => ({ value, judgement: "OK" as const });

describe("dimensionStats", () => {
  it("空集合", () => {
    const s = dimensionStats([], spec);
    expect(s.n).toBe(0);
    expect(s.cpk).toBeNull();
  });
  it("單筆:有 min/max/mean,無 stdev/Cpk", () => {
    const s = dimensionStats([ok(10.02)], spec);
    expect(s.mean).toBeCloseTo(10.02);
    expect(s.stdev).toBeNull();
  });
  it("雙邊:置中且 σ = 公差帶/12 → Cp = Cpk = 2", () => {
    // 構造 stdev 精確值:兩點 mean±d,樣本標準差 = d*sqrt(2)
    const d = (0.2 / 12) / Math.SQRT2;
    const s = dimensionStats([ok(10 - d), ok(10 + d)], spec);
    expect(s.cp).toBeCloseTo(2, 5);
    expect(s.cpk).toBeCloseTo(2, 5);
  });
  it("偏心時 Cpk < Cp", () => {
    const s = dimensionStats([ok(10.03), ok(10.05), ok(10.04)], spec);
    expect(s.cpk!).toBeLessThan(s.cp!);
  });
  it("單邊上限只給 Cpk", () => {
    const s = dimensionStats([ok(10.01), ok(10.03)], { nominal: 10, tolMinus: 0, tolPlus: 0.1 });
    expect(s.cp).toBeNull();
    expect(s.cpk).not.toBeNull();
  });
  it("全同值 → stdev 0,Cp/Cpk null", () => {
    const s = dimensionStats([ok(10), ok(10)], spec);
    expect(s.stdev).toBe(0);
    expect(s.cpk).toBeNull();
  });
  it("計數正確", () => {
    const s = dimensionStats([ok(10), { value: 10.09, judgement: "WARN" }, { value: 10.2, judgement: "NG" }], spec);
    expect([s.ok, s.warn, s.ng]).toEqual([1, 1, 1]);
  });
});
