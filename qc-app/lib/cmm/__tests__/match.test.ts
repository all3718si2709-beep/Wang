import { describe, it, expect } from "vitest";
import { matchFeature } from "../match";

const dims = [
  { id: 1, seq: 1, name: "外徑", drawingRef: "A", nominal: 203.2, decimals: 3, gauge: "cmm" },
  { id: 2, seq: 2, name: "總厚", drawingRef: "B", nominal: 38, decimals: 3, gauge: "micrometer" },
  { id: 3, seq: 3, name: "內孔直徑", drawingRef: "C", nominal: 120, decimals: 3, gauge: "cmm" },
  { id: 9, seq: 9, name: "端面平行度", drawingRef: "I", nominal: 0, decimals: 3, gauge: "cmm" },
  { id: 10, seq: 10, name: "外圓同心度", drawingRef: "J", nominal: 0, decimals: 3, gauge: "cmm" },
];

describe("matchFeature", () => {
  it("存過的對應優先", () => {
    expect(matchFeature("XYZ", null, dims, { XYZ: 3 })).toMatchObject({ dimensionSpecId: 3, confidence: "saved" });
  });
  it("名稱相同(含軸尾碼)", () => {
    expect(matchFeature("外徑.D", null, dims, {})).toMatchObject({ dimensionSpecId: 1, confidence: "high" });
  });
  it("名稱包含", () => {
    expect(matchFeature("內孔直徑_上緣.D", null, dims, {})).toMatchObject({ dimensionSpecId: 3, confidence: "medium" });
  });
  it("圖面位置代號", () => {
    expect(matchFeature("DIM_A_OD.D", null, dims, {})).toMatchObject({ dimensionSpecId: 1, confidence: "medium" });
    expect(matchFeature("DIM_C_BORE.D", null, dims, {})).toMatchObject({ dimensionSpecId: 3 });
    // 軸尾碼 .D 不能被當成圖面 D
    const dims2 = [...dims, { id: 4, seq: 4, name: "密封面高度", drawingRef: "D", nominal: 6, decimals: 2, gauge: "height_gauge" }, { id: 7, seq: 7, name: "螺栓孔 PCD", drawingRef: "G", nominal: 190.5, decimals: 2, gauge: "cmm" }];
    expect(matchFeature("DIM_G_PCD.D", null, dims2, {})).toMatchObject({ dimensionSpecId: 7 });
  });
  it("標稱唯一符合 → low;多個符合 → 請選", () => {
    expect(matchFeature("CIRCLE3.D", 120.0, dims, {})).toMatchObject({ dimensionSpecId: 3, confidence: "low" });
    expect(matchFeature("PLANE1", 0, dims, {})).toMatchObject({ dimensionSpecId: null, confidence: "none" });
  });
  it("完全對不到", () => {
    expect(matchFeature("SOMETHING", 999, dims, {})).toMatchObject({ dimensionSpecId: null, confidence: "none" });
  });
});
