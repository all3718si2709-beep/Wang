"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { parseCmmFiles, suggestCmmMatches, commitCmmImport, type ParsedFile, type MatchSuggestion } from "@/lib/actions/cmm";
import { extractReadings, type ColumnRole, type FeatureReading } from "@/lib/cmm/parse";
import { Button, Card, Select, Badge, fmtTol } from "@/components/ui";
import { judgeDimension } from "@/lib/engine";
import { Upload, ArrowRight, CheckCircle2, AlertTriangle, FileText } from "lucide-react";

type Dim = { id: number; seq: number; name: string; nominal: number; tolMinus: number; tolPlus: number; decimals: number; gauge: string; drawingRef: string | null };
const ROLE_LABEL: Record<ColumnRole, string> = { feature: "特性名稱 *", axis: "軸 / 分項(選)", nominal: "標稱(選,幫助自動對應)", actual: "實測值 *", upper: "上公差(選)", lower: "下公差(選)", piece: "件號欄(選,一檔多件時)" };
const ROLES: ColumnRole[] = ["feature", "axis", "actual", "nominal", "piece", "upper", "lower"];

export function CmmImport({ lotId, quantity }: { lotId: number; quantity: number }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [cols, setCols] = useState<Partial<Record<ColumnRole, number>>>({});
  const [pieceOf, setPieceOf] = useState<Record<number, number>>({}); // fileIndex → seqNo(檔 = 一件模式)
  const [pieceLabelMap, setPieceLabelMap] = useState<Record<string, number>>({}); // 件號欄的值 → seqNo
  const [sugg, setSugg] = useState<MatchSuggestion[]>([]);
  const [dims, setDims] = useState<Dim[]>([]);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [overwrite, setOverwrite] = useState(true);
  const [result, setResult] = useState<{ written: number; skipped: string[]; pieces: number } | null>(null);

  // 以第一個檔的欄位為準(同一台三次元匯出格式一致)
  const first = files[0];
  const readingsPerFile = useMemo(() => files.map((f) => extractReadings({ ...f, delimiter: ",", headerRow: 0, encoding: f.encoding as "utf-8" | "big5" }, cols)), [files, cols]);
  const usePieceColumn = cols.piece != null;
  const pieceLabels = useMemo(() => [...new Set(readingsPerFile.flat().map((r) => r.piece).filter((p): p is string => !!p))], [readingsPerFile]);
  const keys = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const r of readingsPerFile.flat()) if (!m.has(r.key)) m.set(r.key, r.nominal);
    return [...m.entries()].map(([key, nominal]) => ({ key, nominal }));
  }, [readingsPerFile]);

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setErr(null);
    const r = await parseCmmFiles(new FormData(e.currentTarget));
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setFiles(r.files);
    setCols(r.files[0].guess);
    // 件號預設:抬頭有序號就用,否則依上傳順序 1,2,3…
    const po: Record<number, number> = {};
    r.files.forEach((f, i) => { const n = f.serialHint ? Number(f.serialHint) : NaN; po[i] = Number.isInteger(n) && n >= 1 && n <= quantity ? n : i + 1; });
    setPieceOf(po);
    setStep(2);
  }

  async function toMapping() {
    if (cols.feature == null || cols.actual == null) { setErr("至少要指定「特性名稱」和「實測值」兩欄"); return; }
    if (!keys.length) { setErr("依這個欄位設定讀不到任何量測值,請檢查實測值欄"); return; }
    setBusy(true); setErr(null);
    const r = await suggestCmmMatches(lotId, keys);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setSugg(r.suggestions); setDims(r.dims);
    setMapping(Object.fromEntries(r.suggestions.map((s) => [s.key, s.match.dimensionSpecId])));
    if (usePieceColumn) {
      const m: Record<string, number> = {};
      pieceLabels.forEach((l, i) => { const n = Number(l.replace(/[^0-9]/g, "")); m[l] = Number.isInteger(n) && n >= 1 && n <= quantity ? n : i + 1; });
      setPieceLabelMap(m);
    }
    setStep(3);
  }

  // 預覽:每筆讀值 → 件號 + 項次 + 判定
  const preview = useMemo(() => {
    const rows: { file: string; key: string; pieceSeq: number; dim: Dim | undefined; actual: number; judgement: "OK" | "WARN" | "NG" | null }[] = [];
    readingsPerFile.forEach((rs, fi) => {
      for (const r of rs) {
        const dimId = mapping[r.key];
        const dim = dims.find((d) => d.id === dimId);
        const pieceSeq = usePieceColumn && r.piece ? pieceLabelMap[r.piece] ?? 0 : pieceOf[fi] ?? fi + 1;
        rows.push({ file: files[fi].fileName, key: r.key, pieceSeq, dim, actual: r.actual, judgement: dim ? judgeDimension(dim, r.actual).judgement : null });
      }
    });
    return rows;
  }, [readingsPerFile, mapping, dims, pieceOf, pieceLabelMap, usePieceColumn, files]);
  const mappedCount = preview.filter((p) => p.dim).length;

  async function commit() {
    setBusy(true); setErr(null);
    const payload = {
      files: files.map((f, fi) => ({
        fileName: f.fileName, encoding: f.encoding,
        readings: readingsPerFile[fi].map((r: FeatureReading) => ({ key: r.key, actual: r.actual, pieceSeq: usePieceColumn && r.piece ? pieceLabelMap[r.piece] ?? 0 : pieceOf[fi] ?? fi + 1 })),
      })),
      mapping, overwriteManual: overwrite,
    };
    const r = await commitCmmImport(lotId, payload);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setResult(r); setStep(4);
  }


  return (
    <div>
      <Steps step={step} />
      {err && <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-ng-soft px-4 py-2.5 text-[13.5px] text-ng"><AlertTriangle className="h-4 w-4" />{err}</div>}

      {step === 1 && (
        <Card title="1. 上傳三次元匯出的報告">
          <form onSubmit={onUpload} className="space-y-4">
            <p className="text-[13.5px] text-ink-2">支援 CSV / TXT(逗號、分號、Tab 分隔皆可,UTF-8 或 Big5)。PC-DMIS、MCOSMOS、Calypso、Rational 等軟體的「匯出 CSV / 文字報告」都能讀。<b>Excel 檔請先「另存新檔 → CSV」。</b></p>
            <ul className="text-[13px] text-ink-3 list-disc pl-5 space-y-1">
              <li><b>一檔一件</b>(最常見):一次選多個檔,系統依檔名順序或抬頭裡的序號指定件號,下一步可改。</li>
              <li><b>一檔多件</b>:檔裡有「件號 / Serial / 工件」欄,下一步指定那一欄即可。</li>
            </ul>
            <label className="flex flex-col items-center justify-center gap-2 h-36 rounded-lg border-2 border-dashed border-line-2 bg-canvas/50 cursor-pointer hover:border-brand hover:bg-brand-soft/30">
              <Upload className="h-6 w-6 text-ink-3" />
              <span className="text-[14px] text-ink-2">點這裡選檔(可多選)</span>
              <input type="file" name="files" accept=".csv,.txt,.tsv,.dat,text/*" multiple className="hidden" onChange={(e) => e.currentTarget.form?.requestSubmit()} />
            </label>
            <div className="text-[12.5px] text-ink-3">{busy ? "解析中…" : "選完檔會自動進下一步"}</div>
          </form>
        </Card>
      )}

      {step === 2 && first && (
        <div className="space-y-4">
          <Card title={`2. 指定欄位(共 ${files.length} 個檔,以第一個為準)`}>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              {ROLES.map((role) => (
                <label key={role} className="block">
                  <div className="mb-1 text-[12.5px] font-medium text-ink-2">{ROLE_LABEL[role]}</div>
                  <Select value={cols[role] ?? ""} onChange={(e) => setCols((c) => ({ ...c, [role]: e.target.value === "" ? undefined : Number(e.target.value) }))}>
                    <option value="">—</option>
                    {first.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </Select>
                </label>
              ))}
            </div>
            {first.preamble.length > 0 && <div className="mb-3 text-[12px] text-ink-3">抬頭(已跳過):{first.preamble.slice(0, 3).join(" | ")}{first.preamble.length > 3 ? " …" : ""}</div>}
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="text-[12.5px] min-w-full">
                <thead><tr className="bg-canvas">{first.headers.map((h, i) => { const role = ROLES.find((r) => cols[r] === i); return <th key={i} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{h}{role && <span className="ml-1 text-[10.5px] text-brand">← {ROLE_LABEL[role].replace(/[ *(].*$/, "")}</span>}</th>; })}</tr></thead>
                <tbody>{first.rows.slice(0, 8).map((r, i) => <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="px-2 py-1 num whitespace-nowrap">{c}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <div className="mt-2 text-[12.5px] text-ink-3">前 8 列預覽 · 依目前設定可讀到 <b className="text-ink">{keys.length}</b> 個特性、<b className="text-ink">{readingsPerFile.flat().length}</b> 筆讀值{usePieceColumn && ` · 件號欄有 ${pieceLabels.length} 個不同值`}</div>
          </Card>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setStep(1); setFiles([]); }}>重選檔案</Button>
            <Button onClick={toMapping} disabled={busy}>{busy ? "比對中…" : <>下一步:對應項次<ArrowRight className="h-4 w-4" /></>}</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <Card title="3a. 三次元特性 ↔ 規格項次" actions={<span className="text-[12px] text-ink-3">選過會記住,下次同料號自動對應;留「不匯入」的特性會略過</span>}>
            <table className="w-full text-[13px]">
              <thead><tr className="text-[12px] text-ink-3"><th className="text-left py-1.5">三次元特性</th><th className="text-left py-1.5">系統怎麼猜</th><th className="text-left py-1.5 w-[40%]">對到規格項次</th></tr></thead>
              <tbody>
                {sugg.map((s) => (
                  <tr key={s.key} className="border-t border-line">
                    <td className="py-1.5 num font-medium">{s.key}</td>
                    <td className="py-1.5"><Badge tone={s.match.confidence === "saved" || s.match.confidence === "high" ? "ok" : s.match.confidence === "none" ? "warn" : "neutral"}>{s.match.reason}</Badge></td>
                    <td className="py-1.5">
                      <Select value={mapping[s.key] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [s.key]: e.target.value === "" ? null : Number(e.target.value) }))} className="h-9">
                        <option value="">不匯入</option>
                        {dims.map((d) => <option key={d.id} value={d.id}>{d.seq}. {d.name} {d.nominal.toFixed(d.decimals)}{d.drawingRef ? `(${d.drawingRef})` : ""}</option>)}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title="3b. 件號">
            {usePieceColumn ? (
              <div>
                <p className="text-[13px] text-ink-3 mb-2">檔內「件號欄」的值 → 本批第幾件(1~{quantity})</p>
                <div className="flex flex-wrap gap-2">
                  {pieceLabels.map((l) => (
                    <label key={l} className="flex items-center gap-1.5 text-[13px] border border-line rounded-md px-2 h-9"><span className="num">{l}</span>→ #<input type="number" min={1} max={quantity} value={pieceLabelMap[l] ?? ""} onChange={(e) => setPieceLabelMap((m) => ({ ...m, [l]: Number(e.target.value) }))} className="w-16 h-7 px-1 num rounded border border-line-2" /></label>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-[13px] text-ink-3 mb-2">一檔一件:每個檔對到本批第幾件(1~{quantity})</p>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {files.map((f, i) => (
                    <label key={i} className="flex items-center gap-2 text-[13px] border border-line rounded-md px-2 h-10"><FileText className="h-4 w-4 text-ink-3 shrink-0" /><span className="truncate flex-1" title={f.fileName}>{f.fileName}</span>{f.serialHint && <span className="text-[11px] text-ink-3">抬頭序號 {f.serialHint}</span>}→ #<input type="number" min={1} max={quantity} value={pieceOf[i] ?? ""} onChange={(e) => setPieceOf((m) => ({ ...m, [i]: Number(e.target.value) }))} className="w-16 h-7 px-1 num rounded border border-line-2" /></label>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card title={`3c. 預覽(將寫入 ${mappedCount} 筆)`}>
            <div className="max-h-72 overflow-auto rounded-md border border-line">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 bg-canvas"><tr><th className="text-left px-2 py-1.5">件</th><th className="text-left px-2 py-1.5">項次</th><th className="text-left px-2 py-1.5">三次元特性</th><th className="text-right px-2 py-1.5">實測</th><th className="text-right px-2 py-1.5">標稱 / 公差</th><th className="px-2 py-1.5">判定</th></tr></thead>
                <tbody>
                  {preview.filter((p) => p.dim).slice(0, 300).map((p, i) => {
                    const d = p.dim!;
                    return <tr key={i} className="border-t border-line"><td className="px-2 py-1 num">#{p.pieceSeq || "?"}</td><td className="px-2 py-1">{d.seq}. {d.name}</td><td className="px-2 py-1 num text-ink-3">{p.key}</td><td className="px-2 py-1 num text-right font-medium">{p.actual.toFixed(d.decimals)}</td><td className="px-2 py-1 num text-right text-ink-3">{d.nominal.toFixed(d.decimals)} {fmtTol(d.tolMinus, d.tolPlus, d.decimals)}</td><td className="px-2 py-1 text-center"><span className={`inline-block h-5 px-1.5 rounded text-[11px] font-semibold ${p.judgement === "NG" ? "bg-ng-soft text-ng" : p.judgement === "WARN" ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok"}`}>{p.judgement}</span></td></tr>;
                  })}
                </tbody>
              </table>
            </div>
            <label className="mt-3 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="h-4 w-4" />同一件同一項次已有手工 / 藍牙量測值時,以三次元值覆蓋(建議勾,三次元較準)</label>
          </Card>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStep(2)}>上一步</Button>
            <Button onClick={commit} disabled={busy || mappedCount === 0}>{busy ? "匯入中…" : `匯入 ${mappedCount} 筆`}</Button>
          </div>
        </div>
      )}

      {step === 4 && result && (
        <Card>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-8 w-8 text-ok shrink-0" />
            <div>
              <div className="text-[18px] font-semibold">匯入完成</div>
              <div className="mt-1 text-[14px] text-ink-2">寫入 <b className="num">{result.written}</b> 筆量測值,更新 <b className="num">{result.pieces}</b> 件的判定。特性對應已記住,下次同料號自動套用。</div>
              {result.skipped.length > 0 && (
                <details className="mt-3 text-[13px]"><summary className="cursor-pointer text-warn">略過 {result.skipped.length} 筆(點開看)</summary><ul className="mt-1 list-disc pl-5 text-ink-3">{result.skipped.map((s, i) => <li key={i}>{s}</li>)}</ul></details>
              )}
              <div className="mt-4 flex gap-2">
                <Link href={`/lots/${lotId}`} className="inline-flex items-center h-10 px-4 rounded-md bg-brand text-white text-[14px] font-medium">回檢驗批看結果</Link>
                <Button variant="secondary" onClick={() => { setStep(1); setFiles([]); setResult(null); }}>再匯一批檔</Button>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function Steps({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap gap-2 mb-5 text-[13px]">
      {["上傳檔案", "指定欄位", "對應項次與件號", "完成"].map((t, i) => (
        <li key={t} className={`flex items-center gap-2 h-8 px-3 rounded-full border ${step === i + 1 ? "bg-brand text-white border-brand" : step > i + 1 ? "bg-ok-soft text-ok border-green-200" : "bg-white text-ink-3 border-line-2"}`}>
          <span className="num font-semibold">{i + 1}</span>{t}
        </li>
      ))}
    </ol>
  );
}
