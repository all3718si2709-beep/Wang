import { describe, it, expect } from "vitest";
import { parseText, guessColumns, extractReadings, detectDelimiter, findHeaderRow, decodeBytes } from "../parse";

const pcdmis = `PART NAME : VD-8-150
REV NUMBER : B
SER NUMBER : 3
STATS COUNT : 1

FEATURE,AXIS,NOMINAL,MEAS,+TOL,-TOL,DEV,OUTTOL
DIM_A_OD,D,203.200,203.212,0.100,-0.100,0.012,0.000
DIM_C_BORE,D,120.000,120.031,0.050,0.000,0.031,0.000
DIM_G_PCD,D,190.500,190.48,0.200,-0.200,-0.020,0.000
FLATNESS_I,,0.000,0.021,0.050,0.000,0.021,0.000
DIM_A_OD,X,0.000,0.004,0.100,-0.100,0.004,0.000`;

const mcosmos = `No.;Element;Char;Nominal;Actual;Upper tol;Lower tol;Dev;Out
1;外徑;D;203.200;203.198;0.100;-0.100;-0.002;
2;內孔直徑;D;120.000;120.022;0.050;0.000;0.022;
3;端面平行度;PAR;0.000;0.018;0.050;0.000;0.018;`;

const calypso = `Feature name\tActual\tNominal\tUpper tol\tLower tol\tDev
Outer diameter\t203.205\t203.200\t0.100\t-0.100\t0.005
Bore\t120.041\t120.000\t0.050\t0.000\t0.041`;

describe("parseText", () => {
  it("PC-DMIS 風格:跳過抬頭列、逗號、特性 + 軸", () => {
    const t = parseText(pcdmis);
    expect(t.delimiter).toBe(",");
    expect(t.headers[0]).toBe("FEATURE");
    expect(t.preamble.length).toBe(4);
    expect(t.rows.length).toBe(5);
    const cols = guessColumns(t.headers, t.rows);
    expect(cols).toMatchObject({ feature: 0, axis: 1, nominal: 2, actual: 3, upper: 4, lower: 5 });
    const rd = extractReadings(t, cols);
    expect(rd[0]).toMatchObject({ key: "DIM_A_OD.D", actual: 203.212, nominal: 203.2 });
    expect(rd[3].key).toBe("FLATNESS_I");
  });
  it("MCOSMOS 風格:分號、中文特性", () => {
    const t = parseText(mcosmos);
    expect(t.delimiter).toBe(";");
    const cols = guessColumns(t.headers, t.rows);
    expect(t.headers[cols.feature!]).toBe("Element");
    expect(t.headers[cols.actual!]).toBe("Actual");
    const rd = extractReadings(t, cols);
    expect(rd.map((r) => r.key)).toEqual(["外徑.D", "內孔直徑.D", "端面平行度.PAR"]);
  });
  it("Calypso 風格:Tab、實測在標稱前面", () => {
    const t = parseText(calypso);
    expect(t.delimiter).toBe("\t");
    const cols = guessColumns(t.headers, t.rows);
    expect(t.headers[cols.actual!]).toBe("Actual");
    expect(t.headers[cols.nominal!]).toBe("Nominal");
    expect(extractReadings(t, cols)[1].actual).toBe(120.041);
  });
  it("沒有表頭關鍵字也能猜:第一個文字欄 = 特性,離標稱最近的數字欄 = 實測", () => {
    const t = parseText(`名稱,標稱,量測,偏差\n外徑,203.2,203.21,0.01\n總厚,38,38.02,0.02`);
    const cols = guessColumns(t.headers, t.rows);
    expect(cols.feature).toBe(0);
    expect(cols.nominal).toBe(1);
    expect(cols.actual).toBe(2);
  });
  it("引號包住含逗號的欄位", () => {
    const t = parseText(`Feature,Actual\n"外徑, 上緣",203.2\n總厚,38`);
    expect(t.rows[0][0]).toBe("外徑, 上緣");
  });
  it("Big5 自動偵測", () => {
    const big5 = new Uint8Array([0xa5, 0x7e, 0xae, 0x7c, 0x2c, 0x41, 0x63, 0x74, 0x75, 0x61, 0x6c, 0x0a, 0xa5, 0x7e, 0xae, 0x7c, 0x2c, 0x32, 0x30, 0x33, 0x2e, 0x32]); // 外徑,Actual\n外徑,203.2
    const d = decodeBytes(big5);
    expect(d.encoding).toBe("big5");
    expect(d.text.startsWith("外徑")).toBe(true);
  });
  it("detectDelimiter / findHeaderRow 基本", () => {
    expect(detectDelimiter(["a|b|c", "1|2|3"])).toBe("|");
    expect(findHeaderRow([["零件", "VD"], ["日期", "2026"], ["F", "N", "A"], ["x", "1", "2"]])).toBe(2);
  });
});
