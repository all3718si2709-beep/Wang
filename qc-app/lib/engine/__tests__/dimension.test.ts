import { describe, it, expect } from "vitest";
import { judgeDimension } from "../dimension";

const spec = { nominal: 254.0, tolMinus: -0.05, tolPlus: 0.05, decimals: 2 };

describe("judgeDimension 雙邊公差", () => {
  it("正中 → OK,usage 0", () => {
    const r = judgeDimension(spec, 254.0);
    expect(r.judgement).toBe("OK");
    expect(r.usage).toBe(0);
  });
  it("邊界值含在內 → 上下限都不是 NG", () => {
    expect(judgeDimension(spec, 254.05).judgement).not.toBe("NG");
    expect(judgeDimension(spec, 253.95).judgement).not.toBe("NG");
  });
  it("邊界值用掉 100% 公差 → WARN", () => {
    expect(judgeDimension(spec, 254.05).judgement).toBe("WARN");
  });
  it("超出 → NG", () => {
    expect(judgeDimension(spec, 254.051).judgement).toBe("NG");
    expect(judgeDimension(spec, 253.949).judgement).toBe("NG");
  });
  it("用掉 80% → WARN,79% → OK", () => {
    expect(judgeDimension(spec, 254.04).judgement).toBe("WARN");
    expect(judgeDimension(spec, 254.039).judgement).toBe("OK");
  });
  it("warnRatio 可調", () => {
    expect(judgeDimension(spec, 254.04, 0.9).judgement).toBe("OK");
  });
  it("浮點誤差不影響邊界:0.1+0.2 類問題", () => {
    const s = { nominal: 10.1, tolMinus: -0.2, tolPlus: 0.2, decimals: 1 };
    expect(judgeDimension(s, 10.3).judgement).not.toBe("NG");
    expect(judgeDimension(s, 9.9).judgement).not.toBe("NG");
  });
});

describe("judgeDimension 單邊公差", () => {
  const uni = { nominal: 38.0, tolMinus: 0, tolPlus: 0.1, decimals: 2 };
  it("往沒有公差的那側任何偏移 → NG,usage Infinity", () => {
    const r = judgeDimension(uni, 37.99);
    expect(r.judgement).toBe("NG");
    expect(r.usage).toBe(Infinity);
  });
  it("往有公差那側正常判定", () => {
    expect(judgeDimension(uni, 38.05).judgement).toBe("OK");
    expect(judgeDimension(uni, 38.09).judgement).toBe("WARN");
    expect(judgeDimension(uni, 38.11).judgement).toBe("NG");
  });
  it("剛好標稱 → OK", () => {
    expect(judgeDimension(uni, 38.0).judgement).toBe("OK");
  });
});

describe("judgeDimension 防呆", () => {
  it("公差方向寫反要報錯", () => {
    expect(() => judgeDimension({ nominal: 1, tolMinus: 0.1, tolPlus: 0.1 }, 1)).toThrow();
  });
  it("NaN 要報錯", () => {
    expect(() => judgeDimension(spec, NaN)).toThrow();
  });
});
