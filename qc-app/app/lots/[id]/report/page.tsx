import { notFound } from "next/navigation";
import Link from "next/link";
import { getLotDetail, getSettings } from "@/lib/queries";
import { INSPECTION_TYPES, LOT_DISPOSITION_LABEL, VERDICT_LABEL, DISPOSITION_LABEL, GAUGES, DEFECT_CODES, defectByCode, zoneByCode, isAttributeGauge } from "@/lib/domain";
import { fmt, fmtTol, fmtDate, fmtDay } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lot = await getLotDetail(Number(id));
  if (!lot) notFound();
  const s = await getSettings();
  const sum = lot.summary;
  const ngPieces = lot.pieces.filter((p) => p.effectiveVerdict === "NG");
  const findings = lot.pieces.flatMap((p) => p.findings.map((f) => ({ ...f, seqNo: p.seqNo })));
  const byDefect = DEFECT_CODES.map((d) => ({ d, items: findings.filter((f) => f.defectCode === d.code) })).filter((x) => x.items.length > 0);
  const overall = lot.status === "closed" ? LOT_DISPOSITION_LABEL[lot.disposition ?? ""] : sum.ng > 0 ? "含拒收件(未結批)" : sum.pending + sum.review > 0 ? "檢驗中" : "允收(未結批)";
  const reportNo = `${lot.lotNo}-${lot.inspectionType}`;

  return (
    <div className="bg-canvas min-h-screen">
      <div className="no-print sticky top-0 z-10 bg-panel border-b border-line px-6 py-3 flex items-center justify-between">
        <div className="text-[13.5px]"><Link href={`/lots/${lot.id}`} className="text-brand hover:underline">← 回檢驗批</Link><span className="mx-2 text-line-2">|</span>列印時選「另存為 PDF」即為客戶版報告{lot.status !== "closed" && <span className="ml-2 text-warn">此批尚未結批,報告會標示「檢驗中」</span>}</div>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-[210mm] bg-white text-ink px-[12mm] py-[12mm] my-6 shadow-sm print:shadow-none print:my-0 text-[11.5px] leading-snug">
        {/* 抬頭 */}
        <header className="flex items-start justify-between border-b-2 border-ink pb-3">
          <div>
            <div className="text-[18px] font-bold tracking-tight">{s["company.name"] || "（公司名稱）"}</div>
            <div className="text-ink-3 mt-0.5">{s["company.address"]}{s["company.phone"] ? ` · ${s["company.phone"]}` : ""}</div>
          </div>
          <div className="text-right">
            <div className="text-[16px] font-bold">{lot.inspectionType === "FAI" ? "首件檢驗報告" : lot.inspectionType === "IQC" ? "進料檢驗報告" : "出貨檢驗報告"}</div>
            <div className="text-ink-3">{lot.inspectionType === "FAI" ? "First Article Inspection Report" : lot.inspectionType === "IQC" ? "Incoming Inspection Report" : "Final Inspection Report / Certificate of Conformance"}</div>
            <div className="mt-1 num">報告編號 {reportNo}</div>
          </div>
        </header>

        {/* 基本資料 */}
        <table className="w-full mt-3 border border-line [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_td:nth-child(odd)]:bg-canvas [&_td:nth-child(odd)]:text-ink-3 [&_td:nth-child(odd)]:w-[18%] [&_td:nth-child(even)]:w-[32%]">
          <tbody>
            <tr><td>客戶</td><td>{lot.part.customer.name}</td><td>料號</td><td className="num font-medium">{lot.part.partNo}</td></tr>
            <tr><td>品名</td><td>{lot.part.name}</td><td>圖號 / 版次</td><td className="num">{lot.part.drawingNo ?? "—"}{lot.part.drawingRev ? ` / Rev ${lot.part.drawingRev}` : ""}</td></tr>
            <tr><td>材質</td><td>{lot.part.material ?? "—"}</td><td>標稱尺寸</td><td className="num">{lot.part.nominalSizeInch != null ? `${lot.part.nominalSizeInch}"` : "—"}</td></tr>
            <tr><td>檢驗批號</td><td className="num">{lot.lotNo}</td><td>檢驗類別</td><td>{lot.inspectionType} {INSPECTION_TYPES[lot.inspectionType]?.nameZh}</td></tr>
            <tr><td>ERP 工單</td><td className="num">{lot.erpWorkOrder ?? "—"}</td><td>ERP 採購批</td><td className="num">{lot.erpPoNo ?? "—"}</td></tr>
            <tr><td>毛胚供應商</td><td>{lot.supplier?.name ?? "—"}</td><td>爐號</td><td className="num">{lot.heatNo ?? "—"}</td></tr>
            <tr><td>批量 / 檢驗數</td><td className="num">{lot.quantity} / {lot.pieces.length}(全檢)</td><td>允收標準版本</td><td className="num">v{lot.spec.version}{lot.spec.activatedAt ? `(${fmtDay(lot.spec.activatedAt)} 生效)` : ""}</td></tr>
            <tr><td>檢驗日期</td><td className="num">{fmtDay(lot.createdAt)}{lot.closedAt ? ` ~ ${fmtDay(lot.closedAt)}` : ""}</td><td>檢驗員</td><td>{lot.inspector ?? "—"}</td></tr>
          </tbody>
        </table>

        {/* 結果摘要 */}
        <section className="mt-4">
          <h2 className="font-bold text-[13px] border-l-4 border-ink pl-2 mb-2">1. 檢驗結果摘要</h2>
          <div className="grid grid-cols-5 gap-2 text-center">
            {[["批量", sum.total], ["允收", sum.ok], ["拒收", sum.ng], ["待複判", sum.review], ["未完成", sum.pending]].map(([l, v]) => (
              <div key={l as string} className="border border-line rounded px-2 py-1.5"><div className="text-ink-3 text-[10.5px]">{l}</div><div className="num text-[16px] font-semibold">{v}</div></div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2"><span className="text-ink-3">批結論</span><span className={`px-2 py-0.5 rounded font-bold ${lot.disposition === "accept" ? "bg-ok-soft text-ok" : lot.disposition === "reject" ? "bg-ng-soft text-ng" : "bg-warn-soft text-warn"}`}>{overall}</span>{lot.notes && <span className="text-ink-3">· {lot.notes}</span>}</div>
        </section>

        {/* 尺寸 */}
        <section className="mt-4">
          <h2 className="font-bold text-[13px] border-l-4 border-ink pl-2 mb-2">2. 尺寸檢驗結果</h2>
          <table className="w-full border border-line [&_th]:border [&_th]:border-line [&_th]:bg-canvas [&_th]:px-1.5 [&_th]:py-1 [&_th]:font-medium [&_th]:text-ink-2 [&_td]:border [&_td]:border-line [&_td]:px-1.5 [&_td]:py-1">
            <thead>
              <tr><th>#</th><th className="text-left">特性</th><th>圖面</th><th>標稱</th><th>公差</th><th>量具</th><th>n</th><th>Min</th><th>Max</th><th>Mean</th><th>Cpk</th><th>判定</th></tr>
            </thead>
            <tbody>
              {lot.stats.map(({ dim: d, stats: st }) => (
                <tr key={d.id} className="text-center num">
                  <td>{d.seq}</td>
                  <td className="text-left font-sans">{d.name}{d.critical && <span className="ml-1 text-[9px] font-bold text-brand">CTQ</span>}</td>
                  <td>{d.drawingRef ?? ""}</td>
                  <td>{d.nominal.toFixed(d.decimals)} {d.unit}</td>
                  <td>{fmtTol(d.tolMinus, d.tolPlus, d.decimals)}</td>
                  <td className="font-sans">{GAUGES[d.gauge]?.nameZh}</td>
                  <td>{st.n}</td>
                  {isAttributeGauge(d.gauge) ? (
                    <td colSpan={4} className="font-sans">通 {st.ok} / 不通 {st.ng}(屬性量測,無數值)</td>
                  ) : (
                    <>
                      <td>{fmt(st.min, d.decimals)}</td>
                      <td>{fmt(st.max, d.decimals)}</td>
                      <td>{fmt(st.mean, d.decimals)}</td>
                      <td>{st.cpk == null ? "—" : st.cpk.toFixed(2)}</td>
                    </>
                  )}
                  <td className={`font-sans font-semibold ${st.ng > 0 ? "text-ng" : st.n === 0 ? "text-ink-3" : "text-ok"}`}>{st.n === 0 ? "未量" : st.ng > 0 ? `NG ×${st.ng}` : "OK"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-ink-3">Cpk 依樣本標準差計算,n&lt;2 或所有值相同時不顯示;單邊公差顯示單側 Cpk。</p>
        </section>

        {/* 外觀 */}
        <section className="mt-4">
          <h2 className="font-bold text-[13px] border-l-4 border-ink pl-2 mb-2">3. 外觀檢驗結果(依 MSS SP-55 分類)</h2>
          {byDefect.length === 0 ? <p className="text-ink-2">全數件目視檢查,未發現外觀缺陷。</p> : (
            <table className="w-full border border-line [&_th]:border [&_th]:border-line [&_th]:bg-canvas [&_th]:px-1.5 [&_th]:py-1 [&_th]:font-medium [&_th]:text-ink-2 [&_td]:border [&_td]:border-line [&_td]:px-1.5 [&_td]:py-1">
              <thead><tr><th>代號</th><th className="text-left">缺陷類型</th><th>件數</th><th>拒收</th><th>允收範圍內</th><th>待複判</th><th className="text-left">涉及件號</th><th>責任</th></tr></thead>
              <tbody>
                {byDefect.map(({ d, items }) => (
                  <tr key={d.code} className="text-center">
                    <td className="num font-semibold">{d.code}</td>
                    <td className="text-left">{d.nameZh} <span className="text-ink-3">{d.nameEn}</span></td>
                    <td className="num">{new Set(items.map((i) => i.seqNo)).size}</td>
                    <td className="num text-ng">{items.filter((i) => i.judgement === "NG").length || ""}</td>
                    <td className="num text-ok">{items.filter((i) => i.judgement === "OK").length || ""}</td>
                    <td className="num text-review">{items.filter((i) => i.judgement === "REVIEW").length || ""}</td>
                    <td className="text-left num">{[...new Set(items.map((i) => i.seqNo))].sort((a, b) => a - b).map((n) => `#${n}`).join(", ")}</td>
                    <td>{d.responsibility === "supplier" ? "上游" : "廠內"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* NG 明細 */}
        {ngPieces.length > 0 && (
          <section className="mt-4">
            <h2 className="font-bold text-[13px] border-l-4 border-ink pl-2 mb-2">4. 拒收件明細與處置</h2>
            <table className="w-full border border-line [&_th]:border [&_th]:border-line [&_th]:bg-canvas [&_th]:px-1.5 [&_th]:py-1 [&_th]:font-medium [&_th]:text-ink-2 [&_td]:border [&_td]:border-line [&_td]:px-1.5 [&_td]:py-1 [&_td]:align-top">
              <thead><tr><th>件號</th><th className="text-left">拒收原因</th><th>處置</th></tr></thead>
              <tbody>
                {ngPieces.map((p) => {
                  const dimNg = p.measurements.filter((m) => m.judgement === "NG").map((m) => { const d = lot.dims.find((x) => x.id === m.dimensionSpecId)!; return m.attribute ? `${d.name} 塞規不通` : `${d.name} ${m.value.toFixed(d.decimals)}(${d.nominal.toFixed(d.decimals)} ${fmtTol(d.tolMinus, d.tolPlus, d.decimals)})`; });
                  const visNg = p.findings.filter((f) => f.judgement === "NG").map((f) => `${f.defectCode} ${defectByCode(f.defectCode)?.nameZh} @ ${zoneByCode(f.zone)?.nameZh}${f.sizeMm != null ? ` ${f.sizeMm}mm` : ""}${f.count > 1 ? ` ×${f.count}` : ""}`);
                  return (
                    <tr key={p.id}>
                      <td className="num text-center">#{p.seqNo}{p.serial ? ` (${p.serial})` : ""}</td>
                      <td>{[...dimNg, ...visNg].join(";")}{p.finalVerdict && p.finalReason ? <div className="text-ink-3">人工覆判:{p.finalReason}</div> : null}</td>
                      <td className="text-center">{p.disposition ? DISPOSITION_LABEL[p.disposition] : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {/* 簽核 */}
        <section className="mt-6">
          <div className="grid grid-cols-3 gap-6">
            {["檢驗 Inspected by", "審核 Reviewed by", "核准 Approved by"].map((l) => (
              <div key={l}><div className="h-12 border-b border-ink" /><div className="mt-1 text-ink-3 flex justify-between"><span>{l}</span><span>日期</span></div></div>
            ))}
          </div>
          <p className="mt-4 text-[10px] text-ink-3">{s["report.footer"] || "本報告依開批當時生效之允收標準判定;尺寸量測值取自三次元量測儀與經校正之手工量具。"}</p>
          <p className="text-[10px] text-ink-3">產出時間 {fmtDate(new Date().toISOString())}</p>
        </section>

        {/* 附錄:每件明細 */}
        <section className="mt-6 print-page break-before-page">
          <h2 className="font-bold text-[13px] border-l-4 border-ink pl-2 mb-2">附錄 A. 逐件量測明細</h2>
          <div className="overflow-x-auto">
            <table className="w-full border border-line text-[10px] [&_th]:border [&_th]:border-line [&_th]:bg-canvas [&_th]:px-1 [&_th]:py-0.5 [&_th]:font-medium [&_td]:border [&_td]:border-line [&_td]:px-1 [&_td]:py-0.5">
              <thead>
                <tr><th>件</th>{lot.dims.map((d) => <th key={d.id} className="num">{d.seq}</th>)}<th>外觀</th><th>判定</th></tr>
                <tr className="text-ink-3"><th></th>{lot.dims.map((d) => <th key={d.id} className="num font-normal">{d.nominal.toFixed(d.decimals)}</th>)}<th></th><th></th></tr>
              </thead>
              <tbody>
                {lot.pieces.map((p) => (
                  <tr key={p.id} className="num text-center">
                    <td>#{p.seqNo}</td>
                    {lot.dims.map((d) => { const m = p.measurements.find((x) => x.dimensionSpecId === d.id); return <td key={d.id} className={m?.judgement === "NG" ? "text-ng font-semibold" : m?.judgement === "WARN" ? "text-warn" : ""}>{m ? (m.attribute ? (m.attribute === "go" ? "通" : "不通") : m.value.toFixed(d.decimals)) : ""}</td>; })}
                    <td className="font-sans">{p.findings.length ? p.findings.map((f) => f.defectCode).join(",") : ""}</td>
                    <td className={`font-sans font-semibold ${p.effectiveVerdict === "NG" ? "text-ng" : p.effectiveVerdict === "OK" ? "text-ok" : "text-ink-3"}`}>{VERDICT_LABEL[p.effectiveVerdict]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
