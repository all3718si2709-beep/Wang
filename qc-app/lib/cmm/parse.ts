/**
 * 三次元(CMM)報告解析:不綁定軟體。
 * 支援 CSV / TSV / TXT(逗號、分號、Tab、| 自動偵測),UTF-8 / Big5 自動偵測,
 * 報告上方的抬頭列(零件名、日期…)自動跳過,找到真正的表頭列。
 */
export interface ParsedTable {
  delimiter: string;
  headerRow: number;
  headers: string[];
  rows: string[][];
  encoding: "utf-8" | "big5";
  /** 表頭列以上的原始文字(抬頭資訊,例如零件名、序號) */
  preamble: string[];
}

export function decodeBytes(buf: Uint8Array): { text: string; encoding: "utf-8" | "big5" } {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  // 有替換字元(U+FFFD)代表不是合法 UTF-8 → 試 Big5(台灣舊軟體常見)
  if (utf8.includes("�")) {
    try {
      return { text: new TextDecoder("big5").decode(buf), encoding: "big5" };
    } catch {
      /* 環境不支援 big5 就退回 utf-8 */
    }
  }
  return { text: utf8.replace(/^﻿/, ""), encoding: "utf-8" };
}

export function detectDelimiter(lines: string[]): string {
  const cands = [",", "\t", ";", "|"];
  let best = ",", bestScore = -1;
  for (const d of cands) {
    const counts = lines.slice(0, 30).map((l) => l.split(d).length - 1).filter((n) => n > 0);
    if (!counts.length) continue;
    // 分隔符在多數列出現次數一致 → 分數高
    const mode = counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)];
    const consistent = counts.filter((c) => c === mode).length;
    const score = consistent * 10 + mode;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

/** 簡單 CSV 欄位切分(支援雙引號包住含分隔符的欄位) */
export function splitLine(line: string, d: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
    } else if (c === d && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const isNum = (s: string) => s !== "" && Number.isFinite(Number(s.replace(/[+\s]/g, "")));

/** 找表頭列:欄數 ≥ 3、非數字欄佔多數、且下一列有數字 */
export function findHeaderRow(table: string[][]): number {
  for (let i = 0; i < Math.min(table.length - 1, 40); i++) {
    const r = table[i];
    if (r.filter((c) => c !== "").length < 3) continue;
    const nonNum = r.filter((c) => c !== "" && !isNum(c)).length;
    if (nonNum < r.filter((c) => c !== "").length * 0.6) continue;
    const next = table[i + 1];
    if (next && next.some(isNum)) return i;
  }
  return 0;
}

export function parseText(text: string): ParsedTable & { encoding: "utf-8" } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const delimiter = detectDelimiter(lines);
  const table = lines.map((l) => splitLine(l, delimiter));
  const headerRow = findHeaderRow(table);
  const width = Math.max(...table.slice(headerRow).map((r) => r.length));
  const headers = table[headerRow].map((h, i) => h || `欄${i + 1}`);
  while (headers.length < width) headers.push(`欄${headers.length + 1}`);
  const rows = table.slice(headerRow + 1).map((r) => { const c = [...r]; while (c.length < width) c.push(""); return c; }).filter((r) => r.some((c) => c !== ""));
  return { delimiter, headerRow, headers, rows, encoding: "utf-8", preamble: lines.slice(0, headerRow) };
}

export function parseBytes(buf: Uint8Array): ParsedTable {
  const { text, encoding } = decodeBytes(buf);
  return { ...parseText(text), encoding };
}

/** 欄位角色 */
export type ColumnRole = "feature" | "axis" | "nominal" | "actual" | "upper" | "lower" | "piece";

const ROLE_PATTERNS: Record<ColumnRole, RegExp> = {
  feature: /^(feature|element|dim(ension)?|name|characteristic|char\.?name|item|特性|名稱|元素|項目|尺寸名)/i,
  axis: /^(axis|char(acteristic)?|軸|項|type)$/i,
  nominal: /(nominal|nom\.?|target|標稱|理論|設計值|基準)/i,
  actual: /(actual|meas(ured)?|act\.?|實測|量測值|測量值|實際)/i,
  upper: /(\+ ?tol|upper|utol|up\.?tol|上公差|上限)/i,
  lower: /(- ?tol|lower|ltol|lo\.?tol|下公差|下限)/i,
  piece: /(piece|part ?(no|id|number)|serial|sample|工件|序號|件號|樣品)/i,
};

/** 依表頭猜欄位角色;猜不到的回 null,由使用者指定 */
export function guessColumns(headers: string[], rows: string[][]): Partial<Record<ColumnRole, number>> {
  const out: Partial<Record<ColumnRole, number>> = {};
  const used = new Set<number>();
  for (const role of ["actual", "nominal", "upper", "lower", "piece", "axis", "feature"] as ColumnRole[]) {
    const idx = headers.findIndex((h, i) => !used.has(i) && ROLE_PATTERNS[role].test(h.trim()));
    if (idx >= 0) { out[role] = idx; used.add(idx); }
  }
  // 沒猜到特性欄:取第一個「非數字為主」的欄
  if (out.feature == null) {
    const idx = headers.findIndex((_, i) => !used.has(i) && rows.slice(0, 20).filter((r) => r[i] && !isNum(r[i])).length >= rows.slice(0, 20).length * 0.6);
    if (idx >= 0) { out.feature = idx; used.add(idx); }
  }
  // 沒猜到實測欄:數字欄裡,跟標稱最接近的那一欄;沒有標稱就取第一個數字欄
  if (out.actual == null) {
    const numCols = headers.map((_, i) => i).filter((i) => !used.has(i) && rows.slice(0, 20).filter((r) => isNum(r[i])).length >= rows.slice(0, 20).length * 0.6);
    if (out.nominal != null && numCols.length) {
      const nomI = out.nominal;
      let best = numCols[0], bestD = Infinity;
      for (const c of numCols) {
        const d = rows.slice(0, 20).reduce((a, r) => (isNum(r[c]) && isNum(r[nomI]) ? a + Math.abs(Number(r[c]) - Number(r[nomI])) : a), 0);
        if (d < bestD) { bestD = d; best = c; }
      }
      out.actual = best;
    } else if (numCols.length) out.actual = numCols[0];
  }
  return out;
}

export interface FeatureReading {
  key: string; // 特性識別:feature 或 feature.axis
  feature: string;
  axis: string | null;
  nominal: number | null;
  actual: number;
  upper: number | null;
  lower: number | null;
  piece: string | null;
  row: number;
}

const num = (s: string | undefined) => (s == null || s === "" ? null : (isNum(s) ? Number(s.replace(/[+\s]/g, "")) : null));

/** 依欄位角色把每列變成一筆讀值 */
export function extractReadings(t: ParsedTable, cols: Partial<Record<ColumnRole, number>>): FeatureReading[] {
  if (cols.feature == null || cols.actual == null) return [];
  const out: FeatureReading[] = [];
  let lastFeature = "";
  t.rows.forEach((r, i) => {
    let feature = r[cols.feature!] ?? "";
    // PC-DMIS 這類:特性名只出現在第一列,後面軸列留空 → 沿用上一列
    if (feature === "" && cols.axis != null && r[cols.axis]) feature = lastFeature;
    if (feature === "") return;
    lastFeature = feature;
    const actual = num(r[cols.actual!]);
    if (actual == null) return;
    const axis = cols.axis != null ? r[cols.axis] || null : null;
    out.push({
      key: axis ? `${feature}.${axis}` : feature,
      feature, axis,
      nominal: cols.nominal != null ? num(r[cols.nominal]) : null,
      actual,
      upper: cols.upper != null ? num(r[cols.upper]) : null,
      lower: cols.lower != null ? num(r[cols.lower]) : null,
      piece: cols.piece != null ? r[cols.piece] || null : null,
      row: i,
    });
  });
  return out;
}
