"use client";
import { useEffect, useState } from "react";
import type { LotDetail } from "@/lib/queries";
import { addFinding, deleteFinding, setFinalVerdict, setPieceDisposition, setPieceSerial } from "@/lib/actions/inspection";
import { judgeFinding } from "@/lib/engine";
import { Button, Input, Select, VerdictBadge, Field, fmtTol } from "@/components/ui";
import { DEFECT_CODES, ZONES, DISPOSITION_LABEL, VERDICT_LABEL, defectByCode, zoneByCode, GAUGES } from "@/lib/domain";
import { X, Trash2, Camera, AlertTriangle } from "lucide-react";

type Piece = LotDetail["pieces"][number];

export function PiecePanel({ lot, piece, onClose, onChanged }: { lot: LotDetail; piece: Piece; onClose: () => void; onChanged: () => void }) {
  const closed = lot.status === "closed";
  const [zone, setZone] = useState(ZONES[0].code);
  const [code, setCode] = useState("IV");
  const [size, setSize] = useState("");
  const [count, setCount] = useState("1");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(piece.finalReason ?? "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 預覽:這筆送出後引擎會怎麼判
  const preview = judgeFinding(lot.visuals, { defectCode: code, zone, sizeMm: size === "" ? null : Number(size), count: Number(count) || 1 }, piece.findings);
  const spec = lot.visuals.find((v) => v.defectCode === code && v.zone === zone);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative h-full w-full max-w-[560px] bg-panel shadow-2xl overflow-y-auto flex flex-col">
        <header className="sticky top-0 z-10 bg-panel border-b border-line px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[18px] font-semibold num">#{piece.seqNo}</span>
            <VerdictBadge v={piece.effectiveVerdict} size="md" />
            {piece.finalVerdict && <span className="text-[12px] text-review">人工覆判(引擎:{VERDICT_LABEL[piece.engineVerdict]})</span>}
          </div>
          <button onClick={onClose} className="h-9 w-9 grid place-items-center rounded-md hover:bg-canvas" aria-label="關閉"><X className="h-5 w-5" /></button>
        </header>

        <div className="p-5 space-y-6 flex-1">
          <div className="grid grid-cols-2 gap-3">
            <Field label="序號 / 刻字(選)">
              <Input defaultValue={piece.serial ?? ""} disabled={closed} className="num" onBlur={async (e) => { if (e.target.value !== (piece.serial ?? "")) { await setPieceSerial(piece.id, e.target.value); onChanged(); } }} />
            </Field>
            <Field label="NG 處置">
              <Select value={piece.disposition ?? ""} disabled={closed} onChange={async (e) => { await setPieceDisposition(piece.id, (e.target.value || null) as never); onChanged(); }}>
                <option value="">—</option>
                {Object.entries(DISPOSITION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </div>

          {/* 尺寸摘要 */}
          <section>
            <h3 className="text-[13px] font-semibold text-ink-2 mb-2">尺寸</h3>
            <table className="w-full text-[12.5px]">
              <tbody>
                {lot.dims.map((d) => {
                  const m = piece.measurements.find((x) => x.dimensionSpecId === d.id);
                  return (
                    <tr key={d.id} className="border-b border-line last:border-b-0">
                      <td className="py-1.5 pr-2 text-ink-3 num w-6">{d.seq}</td>
                      <td className="py-1.5 pr-2">{d.name}<span className="ml-1 text-[11px] text-ink-3">{GAUGES[d.gauge]?.nameZh}</span></td>
                      <td className="py-1.5 pr-2 num text-ink-3 text-right">{d.nominal.toFixed(d.decimals)} {fmtTol(d.tolMinus, d.tolPlus, d.decimals)}</td>
                      <td className="py-1.5 num text-right font-medium w-20">{m ? m.value.toFixed(d.decimals) : <span className="text-ink-3 font-normal">未量</span>}</td>
                      <td className="py-1.5 pl-2 w-14 text-right">{m && <VerdictBadge v={m.judgement} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* 外觀發現 */}
          <section>
            <h3 className="text-[13px] font-semibold text-ink-2 mb-2">外觀發現</h3>
            {piece.findings.length === 0 ? <p className="text-[12.5px] text-ink-3 mb-3">尚無記錄。沒有缺陷不用記,件會依尺寸判允收。</p> : (
              <ul className="space-y-2 mb-3">
                {piece.findings.map((f) => {
                  const def = defectByCode(f.defectCode);
                  return (
                    <li key={f.id} className="flex gap-3 rounded-md border border-line p-2.5">
                      {/* eslint-disable-next-line @next/next/no-img-element -- 本機照片,不走影像最佳化 */}
                      {f.photoPath ? <a href={`/api/photos/${f.photoPath}`} target="_blank" rel="noreferrer" className="shrink-0"><img src={`/api/photos/${f.photoPath}`} alt="" className="h-16 w-16 object-cover rounded" /></a> : <div className="h-16 w-16 shrink-0 rounded bg-canvas grid place-items-center text-ink-3"><Camera className="h-5 w-5" /></div>}
                      <div className="flex-1 min-w-0 text-[12.5px]">
                        <div className="flex items-center gap-2"><VerdictBadge v={f.judgement} /><span className="font-medium"><span className="num">{f.defectCode}</span> {def?.nameZh}</span><span className="text-ink-3">· {zoneByCode(f.zone)?.nameZh}</span></div>
                        <div className="mt-1 text-ink-3 num">{f.sizeMm != null ? `${f.sizeMm} mm` : "尺寸未填"} · ×{f.count}{f.clockPosition ? ` · ${f.clockPosition} 點鐘` : ""} · {f.responsibility === "supplier" ? "上游責任" : "廠內責任"}</div>
                        {f.note && <div className="mt-0.5 text-ink-2">{f.note}</div>}
                      </div>
                      {!closed && <button className="self-start p-1.5 text-ink-3 hover:text-ng" onClick={async () => { if (confirm("刪除此筆發現?")) { await deleteFinding(f.id); onChanged(); } }} aria-label="刪除"><Trash2 className="h-4 w-4" /></button>}
                    </li>
                  );
                })}
              </ul>
            )}

            {!closed && (
              <form
                className="rounded-md border border-line bg-canvas/50 p-3 space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true); setErr(null);
                  const fd = new FormData(e.currentTarget);
                  const r = await addFinding(piece.id, fd);
                  setBusy(false);
                  if (!r.ok) { setErr(r.error); return; }
                  (e.target as HTMLFormElement).reset();
                  setSize(""); setCount("1");
                  onChanged();
                }}
              >
                <div>
                  <div className="text-[12px] font-medium text-ink-2 mb-1">區域</div>
                  <div className="flex flex-wrap gap-1.5">
                    {ZONES.map((z) => <Chip key={z.code} on={zone === z.code} onClick={() => setZone(z.code)}>{z.nameZh}</Chip>)}
                  </div>
                  <input type="hidden" name="zone" value={zone} />
                </div>
                <div>
                  <div className="text-[12px] font-medium text-ink-2 mb-1">缺陷類型</div>
                  <div className="flex flex-wrap gap-1.5">
                    {DEFECT_CODES.map((d) => <Chip key={d.code} on={code === d.code} onClick={() => setCode(d.code)} accent={d.common}><span className="num font-semibold mr-1">{d.code}</span>{d.nameZh}</Chip>)}
                  </div>
                  <input type="hidden" name="defectCode" value={code} />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <Field label="尺寸 mm"><Input name="sizeMm" type="number" step="0.01" min="0" value={size} onChange={(e) => setSize(e.target.value)} className="num h-9" placeholder={spec?.maxSizeMm != null ? `≤${spec.maxSizeMm}` : ""} /></Field>
                  <Field label="數量"><Input name="count" type="number" step="1" min="1" value={count} onChange={(e) => setCount(e.target.value)} className="num h-9" /></Field>
                  <Field label="時鐘方位"><Input name="clockPosition" type="number" min="1" max="12" className="num h-9" placeholder="1~12" /></Field>
                  <Field label="責任">
                    <Select name="responsibility" key={code} defaultValue={defectByCode(code)?.responsibility} className="h-9"><option value="supplier">上游</option><option value="inhouse">廠內</option></Select>
                  </Field>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                  <Field label="備註"><Input name="note" className="h-9" /></Field>
                  <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-line-2 bg-white text-[13px] cursor-pointer hover:bg-canvas">
                    <Camera className="h-4 w-4" />拍照<input type="file" name="photo" accept="image/*" capture="environment" className="hidden" />
                  </label>
                </div>
                <div className={`flex items-center gap-2 rounded px-2.5 py-2 text-[12.5px] ${preview.judgement === "NG" ? "bg-ng-soft text-ng" : preview.judgement === "REVIEW" ? "bg-review-soft text-review" : "bg-ok-soft text-ok"}`}>
                  <AlertTriangle className="h-4 w-4 shrink-0" />引擎預判:{VERDICT_LABEL[preview.judgement]} — {preview.reason}
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={busy}>{busy ? "儲存中…" : "加入發現"}</Button>
                  {err && <span className="text-[12.5px] text-ng">{err}</span>}
                </div>
              </form>
            )}
          </section>

          {/* 人工覆判 */}
          {!closed && (
            <section>
              <h3 className="text-[13px] font-semibold text-ink-2 mb-1">人工覆判</h3>
              <p className="text-[12px] text-ink-3 mb-2">待複判件必須由人決定;也可覆蓋引擎判定,但需填理由,會留稽核紀錄。</p>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="理由(與引擎判定不同時必填)" className="mb-2" />
              <div className="flex gap-2">
                <Button variant="secondary" className="text-ok border-green-300" onClick={async () => { const r = await setFinalVerdict(piece.id, "OK", reason || null); if (!r.ok) alert(r.error); else onChanged(); }}>判允收</Button>
                <Button variant="secondary" className="text-ng border-red-300" onClick={async () => { const r = await setFinalVerdict(piece.id, "NG", reason || null); if (!r.ok) alert(r.error); else onChanged(); }}>判拒收</Button>
                {piece.finalVerdict && <Button variant="ghost" onClick={async () => { await setFinalVerdict(piece.id, null, null); onChanged(); }}>清除覆判,回到引擎判定</Button>}
              </div>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

function Chip({ on, onClick, children, accent }: { on: boolean; onClick: () => void; children: React.ReactNode; accent?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`h-8 px-2.5 rounded-md border text-[12.5px] transition-colors ${on ? "bg-brand text-white border-brand" : accent ? "bg-white border-blue-200 text-ink hover:bg-brand-soft/60" : "bg-white border-line-2 text-ink-2 hover:bg-canvas"}`}>
      {children}
    </button>
  );
}
