"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LotDetail } from "@/lib/queries";
import { saveMeasurement, saveAttribute } from "@/lib/actions/inspection";
import { judgeDimension } from "@/lib/engine";
import { VerdictBadge, fmtTol } from "@/components/ui";
import { GAUGES, FREQUENCIES, isAttributeGauge } from "@/lib/domain";
import { PiecePanel } from "./piece-panel";
import { ArrowDownToLine, ArrowRightToLine, Bluetooth, Camera } from "lucide-react";

type Verdict = "OK" | "NG" | "REVIEW" | "PENDING";
type J = "OK" | "WARN" | "NG";

export function Workspace({ lot }: { lot: LotDetail }) {
  const router = useRouter();
  const closed = lot.status === "closed";
  const [showAll, setShowAll] = useState(lot.inspectionType === "FAI");
  const [order, setOrder] = useState<"row" | "col">("col"); // 預設逐項:同一支量具量完所有件
  const [openPiece, setOpenPiece] = useState<number | null>(null);

  const requiredIds = useMemo(
    () => new Set(lot.inspectionType === "FAI" ? lot.dims.map((d) => d.id) : lot.dims.filter((d) => d.frequency === "each").map((d) => d.id)),
    [lot.dims, lot.inspectionType],
  );
  const dims = showAll ? lot.dims : lot.dims.filter((d) => requiredIds.has(d.id));

  // 伺服器狀態(props)+ 本地覆寫:輸入框本身不受控,避免整頁重抓時清掉打到一半的值
  const base = useMemo(() => {
    const j: Record<string, J> = {};
    const v: Record<number, Verdict> = {};
    for (const p of lot.pieces) {
      v[p.id] = p.effectiveVerdict;
      for (const m of p.measurements) j[`${p.id}:${m.dimensionSpecId}`] = m.judgement;
    }
    return { j, v };
  }, [lot.pieces]);
  const [judgeOv, setJudgeOv] = useState<Record<string, J | null>>({});
  const [verdictOv, setVerdictOv] = useState<Record<number, Verdict>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  // props 換了(伺服器重抓)→ 本地覆寫作廢
  const [prevPieces, setPrevPieces] = useState(lot.pieces);
  if (prevPieces !== lot.pieces) { setPrevPieces(lot.pieces); setJudgeOv({}); setVerdictOv({}); }
  const judgeOf = (k: string): J | undefined => (k in judgeOv ? judgeOv[k] ?? undefined : base.j[k]);
  const verdictOf = (pieceId: number): Verdict => verdictOv[pieceId] ?? base.v[pieceId];

  const refs = useRef<Map<string, HTMLInputElement>>(new Map());
  const key = (pieceId: number, dimId: number) => `${pieceId}:${dimId}`;

  const focusNext = useCallback(
    (pi: number, di: number) => {
      let npi = pi, ndi = di;
      if (order === "row") { ndi++; if (ndi >= dims.length) { ndi = 0; npi++; } }
      else { npi++; if (npi >= lot.pieces.length) { npi = 0; ndi++; } }
      if (npi >= lot.pieces.length || ndi >= dims.length) return;
      const el = refs.current.get(key(lot.pieces[npi].id, dims[ndi].id)) as HTMLElement | undefined;
      el?.focus();
      if (el instanceof HTMLInputElement) el.select();
    },
    [order, dims, lot.pieces],
  );

  const commit = useCallback(
    async (pieceId: number, dimId: number, raw: string, el: HTMLInputElement) => {
      const k = key(pieceId, dimId);
      const dim = lot.dims.find((d) => d.id === dimId)!;
      const trimmed = raw.trim();
      if (trimmed === "") {
        if (el.dataset.prev === "") return;
        el.dataset.prev = "";
        setSaving((s) => ({ ...s, [k]: true }));
        const r = await saveMeasurement(pieceId, dimId, null);
        setSaving((s) => ({ ...s, [k]: false }));
        if (r.ok) { setJudgeOv((j) => ({ ...j, [k]: null })); if (r.pieceVerdict) setVerdictOv((v) => ({ ...v, [pieceId]: r.pieceVerdict! })); }
        return;
      }
      const value = Number(trimmed);
      if (!Number.isFinite(value)) { el.dataset.j = "NG"; return; }
      if (el.dataset.prev === trimmed) return;
      el.dataset.prev = trimmed;
      // 先用同一套引擎在前端算,立即上色;再送後端確認
      const local = judgeDimension(dim, value, lot.spec.warnRatio).judgement;
      setJudgeOv((j) => ({ ...j, [k]: local }));
      setSaving((s) => ({ ...s, [k]: true }));
      const r = await saveMeasurement(pieceId, dimId, value);
      setSaving((s) => ({ ...s, [k]: false }));
      if (!r.ok) { alert(r.error); return; }
      setJudgeOv((j) => ({ ...j, [k]: r.judgement ?? null }));
      if (r.pieceVerdict) setVerdictOv((v) => ({ ...v, [pieceId]: r.pieceVerdict! }));
    },
    [lot.dims, lot.spec.warnRatio],
  );

  const commitAttr = useCallback(
    async (pieceId: number, dimId: number, attr: "go" | "nogo" | null) => {
      const k = key(pieceId, dimId);
      setJudgeOv((j) => ({ ...j, [k]: attr == null ? null : attr === "go" ? "OK" : "NG" }));
      setSaving((s) => ({ ...s, [k]: true }));
      const r = await saveAttribute(pieceId, dimId, attr);
      setSaving((s) => ({ ...s, [k]: false }));
      if (!r.ok) { alert(r.error); return; }
      setJudgeOv((j) => ({ ...j, [k]: r.judgement ?? null }));
      if (r.pieceVerdict) setVerdictOv((v) => ({ ...v, [pieceId]: r.pieceVerdict! }));
    },
    [],
  );

  const counts = useMemo(() => {
    const c = { OK: 0, NG: 0, REVIEW: 0, PENDING: 0 } as Record<Verdict, number>;
    for (const p of lot.pieces) c[verdictOf(p.id)]++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdictOv, base, lot.pieces]);

  const openPieceData = openPiece != null ? lot.pieces.find((p) => p.id === openPiece) ?? null : null;

  return (
    <section className="bg-panel border border-line rounded-lg shadow-[0_1px_2px_rgba(15,23,42,.04)]">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-line">
        <div className="flex items-center gap-3">
          <h2 className="text-[14px] font-semibold text-ink-2">檢驗紀錄</h2>
          <span className="text-[12.5px] text-ink-3 num">允收 {counts.OK} · 拒收 {counts.NG} · 待複判 {counts.REVIEW} · 未完成 {counts.PENDING}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="hidden md:inline-flex items-center gap-1 text-ink-3 mr-1"><Bluetooth className="h-3.5 w-3.5" />藍牙量具:對準格子按傳送即可,Enter 自動跳下一格</span>
          <div className="inline-flex rounded-md border border-line-2 overflow-hidden">
            <button type="button" onClick={() => setOrder("col")} className={`h-8 px-2.5 inline-flex items-center gap-1 ${order === "col" ? "bg-brand text-white" : "bg-white text-ink-2"}`} title="同一項次量完全部件再換下一項(換量具次數最少)"><ArrowDownToLine className="h-3.5 w-3.5" />逐項</button>
            <button type="button" onClick={() => setOrder("row")} className={`h-8 px-2.5 inline-flex items-center gap-1 ${order === "row" ? "bg-brand text-white" : "bg-white text-ink-2"}`} title="一件量完所有項次再換下一件"><ArrowRightToLine className="h-3.5 w-3.5" />逐件</button>
          </div>
          <label className="inline-flex items-center gap-1.5 h-8 px-2 rounded-md border border-line-2 bg-white cursor-pointer select-none">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="h-4 w-4" />顯示抽檢 / 首件項次
          </label>
        </div>
      </header>

      <div className="overflow-auto max-h-[70vh]">
        <table className="border-separate border-spacing-0 text-[13px] min-w-max">
          <thead className="sticky top-0 z-10 bg-panel">
            <tr>
              <th className="sticky left-0 z-20 bg-panel text-left px-3 py-2 border-b border-r border-line text-[12px] text-ink-3 font-medium w-[230px]">件 · 判定 · 外觀</th>
              {dims.map((d) => (
                <th key={d.id} className="px-1.5 py-2 border-b border-line text-left align-bottom min-w-[128px]">
                  <div className="text-[12.5px] font-semibold text-ink leading-tight">{d.seq}. {d.name}{d.critical && <span className="ml-1 text-[10px] text-brand">CTQ</span>}</div>
                  <div className="num text-[11.5px] text-ink-3 leading-tight">{d.nominal.toFixed(d.decimals)} <span className="text-ink-3/70">{fmtTol(d.tolMinus, d.tolPlus, d.decimals)}</span>{isAttributeGauge(d.gauge) && <span className="ml-1 font-sans text-brand">GO / NO-GO</span>}</div>
                  <div className="text-[11px] text-ink-3/80 leading-tight">{GAUGES[d.gauge]?.nameZh} · {FREQUENCIES[d.frequency]}{!requiredIds.has(d.id) && " · 非必量"}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lot.pieces.map((p, pi) => {
              const v = verdictOf(p.id);
              const ngFind = p.findings.filter((f) => f.judgement === "NG").length;
              const revFind = p.findings.filter((f) => f.judgement === "REVIEW").length;
              return (
                <tr key={p.id} className="group">
                  <td className="sticky left-0 z-[5] bg-panel group-hover:bg-[#f4f6fa] px-3 py-1 border-b border-r border-line">
                    <button type="button" onClick={() => setOpenPiece(p.id)} className="flex items-center gap-2 h-9 w-full text-left rounded hover:bg-brand-soft/60 px-1 -mx-1" title="開啟件面板:外觀缺陷、拍照、覆判、處置">
                      <span className="num font-semibold w-8">#{p.seqNo}</span>
                      <VerdictBadge v={v} />
                      <span className={`ml-auto inline-flex items-center gap-1 h-6 px-1.5 rounded border text-[11.5px] ${ngFind > 0 ? "border-red-200 bg-ng-soft text-ng font-semibold" : revFind > 0 ? "border-violet-200 bg-review-soft text-review font-semibold" : p.findings.length > 0 ? "border-line-2 bg-canvas text-ink-2" : "border-line text-ink-3"}`}>
                        <Camera className="h-3.5 w-3.5" />{p.findings.length > 0 ? p.findings.length : ""}
                      </span>
                      {p.finalVerdict && <span className="text-[11px] text-review">覆</span>}
                    </button>
                  </td>
                  {dims.map((d, di) => {
                    const k = key(p.id, d.id);
                    const m = p.measurements.find((x) => x.dimensionSpecId === d.id);
                    const attr = m?.attribute ?? null;
                    const j = judgeOf(k);
                    if (isAttributeGauge(d.gauge)) {
                      const cur: "go" | "nogo" | null = k in judgeOv ? (judgeOv[k] === "OK" ? "go" : judgeOv[k] === "NG" ? "nogo" : null) : attr;
                      return (
                        <td key={d.id} className="px-1.5 py-1 border-b border-line">
                          <div className="flex h-11 rounded-md border border-line-2 overflow-hidden bg-white" data-saving={saving[k] ? "1" : "0"} role="group" aria-label={`${d.name} 通 / 不通`}>
                            <button
                              type="button"
                              ref={(el) => { if (el) refs.current.set(k, el as unknown as HTMLInputElement); else refs.current.delete(k); }}
                              disabled={closed}
                              onClick={() => { void commitAttr(p.id, d.id, cur === "go" ? null : "go"); focusNext(pi, di); }}
                              onKeyDown={(e) => {
                                if (e.key === "ArrowDown" && pi < lot.pieces.length - 1) { e.preventDefault(); (refs.current.get(key(lot.pieces[pi + 1].id, d.id)) as HTMLElement | undefined)?.focus(); }
                                else if (e.key === "ArrowUp" && pi > 0) { e.preventDefault(); (refs.current.get(key(lot.pieces[pi - 1].id, d.id)) as HTMLElement | undefined)?.focus(); }
                                else if (e.key === "0" || e.key.toLowerCase() === "n") { e.preventDefault(); void commitAttr(p.id, d.id, "nogo"); focusNext(pi, di); }
                                else if (e.key === "1" || e.key.toLowerCase() === "g") { e.preventDefault(); void commitAttr(p.id, d.id, "go"); focusNext(pi, di); }
                              }}
                              className={`flex-1 text-[13px] font-semibold transition-colors focus:outline-none focus:ring-[3px] focus:ring-brand-soft ${cur === "go" ? "bg-ok-soft text-ok" : "text-ink-3 hover:bg-canvas"}`}
                            >通</button>
                            <div className="w-px bg-line-2" />
                            <button
                              type="button"
                              disabled={closed}
                              onClick={() => { void commitAttr(p.id, d.id, cur === "nogo" ? null : "nogo"); focusNext(pi, di); }}
                              className={`flex-1 text-[14px] font-semibold transition-colors focus:outline-none focus:ring-[3px] focus:ring-brand-soft ${cur === "nogo" ? "bg-ng-soft text-ng" : "text-ink-3 hover:bg-canvas"}`}
                            >不通</button>
                          </div>
                        </td>
                      );
                    }
                    return (
                      <td key={d.id} className="px-1.5 py-1 border-b border-line">
                        <input
                          ref={(el) => { if (el) refs.current.set(k, el); else refs.current.delete(k); }}
                          className="cell-input"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          disabled={closed}
                          defaultValue={m ? m.value.toFixed(d.decimals) : ""}
                          data-prev={m ? m.value.toFixed(d.decimals) : ""}
                          data-j={j ?? ""}
                          data-saving={saving[k] ? "1" : "0"}
                          placeholder={requiredIds.has(d.id) ? "必量" : "—"}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); void commit(p.id, d.id, e.currentTarget.value, e.currentTarget); focusNext(pi, di); }
                            else if (e.key === "ArrowDown" && pi < lot.pieces.length - 1) { e.preventDefault(); (refs.current.get(key(lot.pieces[pi + 1].id, d.id)) as HTMLElement | undefined)?.focus(); }
                            else if (e.key === "ArrowUp" && pi > 0) { e.preventDefault(); (refs.current.get(key(lot.pieces[pi - 1].id, d.id)) as HTMLElement | undefined)?.focus(); }
                          }}
                          onBlur={(e) => void commit(p.id, d.id, e.currentTarget.value, e.currentTarget)}
                          onFocus={(e) => e.currentTarget.select()}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {closed && <div className="px-5 py-2.5 text-[12.5px] text-ink-3 border-t border-line">此批已結,量測欄位鎖定。</div>}

      {openPieceData && (
        <PiecePanel
          lot={lot}
          piece={openPieceData}
          onClose={() => { setOpenPiece(null); router.refresh(); }}
          onChanged={() => router.refresh()}
        />
      )}
      {!openPieceData && lot.pieces.length > 0 && (
        <div className="px-5 py-2.5 text-[12px] text-ink-3 border-t border-line flex flex-wrap gap-4">
          <span>點件號開啟件面板:記錄外觀缺陷、拍照、人工覆判、處置</span>
          <span>綠=允收 · 黃=接近公差邊緣(警戒)· 紅=超差</span>
          <span>塞規 / 環規:點「通」或「不通」,鍵盤 <kbd className="px-1 rounded border border-line-2 bg-white">1</kbd>=通 <kbd className="px-1 rounded border border-line-2 bg-white">0</kbd>=不通</span>
        </div>
      )}
    </section>
  );
}
