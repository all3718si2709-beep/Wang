import { describe, it, expect } from "vitest";
import { judgePiece } from "../verdict";

const dims = [
  { id: 1, frequency: "each" },
  { id: 2, frequency: "each" },
  { id: 3, frequency: "sample" },
];

describe("judgePiece", () => {
  it("FQC:每件項次量完且全 OK → OK", () => {
    const r = judgePiece({
      inspectionType: "FQC",
      dimensionSpecs: dims,
      measurements: [
        { dimensionSpecId: 1, judgement: "OK" },
        { dimensionSpecId: 2, judgement: "WARN" },
      ],
      findings: [],
    });
    expect(r.verdict).toBe("OK");
    expect(r.requiredDimIds).toEqual([1, 2]);
    expect(r.warnDimCount).toBe(1);
  });
  it("FQC:少量一個每件項次 → PENDING", () => {
    const r = judgePiece({
      inspectionType: "FQC",
      dimensionSpecs: dims,
      measurements: [{ dimensionSpecId: 1, judgement: "OK" }],
      findings: [],
    });
    expect(r.verdict).toBe("PENDING");
    expect(r.missingDimIds).toEqual([2]);
  });
  it("FAI:全部項次都要量", () => {
    const r = judgePiece({
      inspectionType: "FAI",
      dimensionSpecs: dims,
      measurements: [
        { dimensionSpecId: 1, judgement: "OK" },
        { dimensionSpecId: 2, judgement: "OK" },
      ],
      findings: [],
    });
    expect(r.verdict).toBe("PENDING");
    expect(r.missingDimIds).toEqual([3]);
  });
  it("任一 NG 壓過一切,即使未量完", () => {
    const r = judgePiece({
      inspectionType: "FQC",
      dimensionSpecs: dims,
      measurements: [{ dimensionSpecId: 1, judgement: "NG" }],
      findings: [{ judgement: "REVIEW" }],
    });
    expect(r.verdict).toBe("NG");
  });
  it("外觀 NG → NG", () => {
    const r = judgePiece({
      inspectionType: "FQC",
      dimensionSpecs: dims,
      measurements: [
        { dimensionSpecId: 1, judgement: "OK" },
        { dimensionSpecId: 2, judgement: "OK" },
      ],
      findings: [{ judgement: "NG" }],
    });
    expect(r.verdict).toBe("NG");
  });
  it("REVIEW 壓過 PENDING", () => {
    const r = judgePiece({
      inspectionType: "FQC",
      dimensionSpecs: dims,
      measurements: [],
      findings: [{ judgement: "REVIEW" }],
    });
    expect(r.verdict).toBe("REVIEW");
  });
  it("IQC 無每件項次、無發現 → OK(純外觀批)", () => {
    const r = judgePiece({
      inspectionType: "IQC",
      dimensionSpecs: [{ id: 9, frequency: "sample" }],
      measurements: [],
      findings: [],
    });
    expect(r.verdict).toBe("OK");
  });
});
