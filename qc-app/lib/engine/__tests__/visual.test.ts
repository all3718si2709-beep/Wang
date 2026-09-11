import { describe, it, expect } from "vitest";
import { judgeFinding } from "../visual";

const specs = [
  { defectCode: "IV", zone: "sealing_face", allowed: false, maxSizeMm: null, maxCount: null },
  { defectCode: "IV", zone: "outer_dia", allowed: true, maxSizeMm: 0.5, maxCount: 3 },
  { defectCode: "R", zone: "outer_dia", allowed: true, maxSizeMm: null, maxCount: null },
];

describe("judgeFinding", () => {
  it("未定義組合 → REVIEW", () => {
    expect(judgeFinding(specs, { defectCode: "I", zone: "bore", sizeMm: 1, count: 1 }).judgement).toBe("REVIEW");
  });
  it("不允許 → NG,不看尺寸", () => {
    expect(judgeFinding(specs, { defectCode: "IV", zone: "sealing_face", sizeMm: 0.01, count: 1 }).judgement).toBe("NG");
  });
  it("允許且尺寸在上限內 → OK;等於上限 → OK", () => {
    expect(judgeFinding(specs, { defectCode: "IV", zone: "outer_dia", sizeMm: 0.3, count: 1 }).judgement).toBe("OK");
    expect(judgeFinding(specs, { defectCode: "IV", zone: "outer_dia", sizeMm: 0.5, count: 1 }).judgement).toBe("OK");
  });
  it("尺寸超過 → NG", () => {
    expect(judgeFinding(specs, { defectCode: "IV", zone: "outer_dia", sizeMm: 0.6, count: 1 }).judgement).toBe("NG");
  });
  it("有尺寸上限但沒填尺寸 → REVIEW", () => {
    expect(judgeFinding(specs, { defectCode: "IV", zone: "outer_dia", sizeMm: null, count: 1 }).judgement).toBe("REVIEW");
  });
  it("數量累計含同件其他發現:2+2 > 3 → NG", () => {
    const sib = [{ defectCode: "IV", zone: "outer_dia", sizeMm: 0.2, count: 2 }];
    expect(judgeFinding(specs, { defectCode: "IV", zone: "outer_dia", sizeMm: 0.2, count: 2 }, sib).judgement).toBe("NG");
    expect(judgeFinding(specs, { defectCode: "IV", zone: "outer_dia", sizeMm: 0.2, count: 1 }, sib).judgement).toBe("OK");
  });
  it("不同區域的發現不互相累計", () => {
    const sib = [{ defectCode: "IV", zone: "bore", sizeMm: 0.2, count: 10 }];
    expect(judgeFinding(specs, { defectCode: "IV", zone: "outer_dia", sizeMm: 0.2, count: 1 }, sib).judgement).toBe("OK");
  });
  it("允許且無上限 → 一律 OK", () => {
    expect(judgeFinding(specs, { defectCode: "R", zone: "outer_dia", sizeMm: null, count: 99 }).judgement).toBe("OK");
  });
});
