import Link from "next/link";
import { dashboardData } from "@/lib/queries";
import { PageHeader, Card, Stat, Table, VerdictBadge, Badge, LinkButton, Empty, fmtDay } from "@/components/ui";
import { INSPECTION_TYPES, defectByCode, zoneByCode } from "@/lib/domain";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { open, recent, defectBreakdown } = await dashboardData();
  const ngRate = recent.pieces ? ((recent.ng / recent.pieces) * 100).toFixed(1) + "%" : "—";
  return (
    <>
      <PageHeader
        title="儀表板"
        sub="近 30 天檢驗概況與進行中的批"
        actions={<LinkButton href="/lots/new"><Plus className="h-4 w-4" />開新檢驗批</LinkButton>}
      />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Stat label="近 30 天批數" value={recent.lots} />
        <Stat label="檢驗件數" value={recent.pieces} />
        <Stat label="不良率" value={ngRate} tone={recent.ng > 0 ? "ng" : "ok"} sub={`${recent.ng} 件拒收`} />
        <Stat label="上游責任缺陷" value={recent.supplierNg} tone="warn" sub="可退供應商" />
        <Stat label="廠內責任缺陷" value={recent.inhouseNg} tone="review" sub="鏽蝕 / 加工損傷" />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-5">
        <Card title="進行中的檢驗批" pad={false} actions={<Link href="/lots" className="text-[13px] text-brand hover:underline">全部批次</Link>}>
          {open.length === 0 ? (
            <Empty title="目前沒有進行中的批" action={<LinkButton href="/lots/new" variant="secondary">開新檢驗批</LinkButton>} />
          ) : (
            <Table>
              <thead>
                <tr><th>批號</th><th>料號</th><th>類別</th><th>日期</th><th className="text-right">進度</th><th className="text-right">結果</th></tr>
              </thead>
              <tbody>
                {open.map((l) => {
                  const done = l.okCount + l.ngCount;
                  return (
                    <tr key={l.id}>
                      <td><Link href={`/lots/${l.id}`} className="font-medium text-brand hover:underline num">{l.lotNo}</Link></td>
                      <td><div className="font-medium">{l.partNo}</div><div className="text-[12px] text-ink-3">{l.customerName}</div></td>
                      <td><Badge tone="brand">{l.inspectionType} {INSPECTION_TYPES[l.inspectionType]?.nameZh}</Badge></td>
                      <td className="num text-ink-3">{fmtDay(l.createdAt)}</td>
                      <td className="text-right num">{done} / {l.quantity}</td>
                      <td className="text-right space-x-1">
                        {l.ngCount > 0 && <VerdictBadge v="NG" />}
                        {l.reviewCount > 0 && <VerdictBadge v="REVIEW" />}
                        {l.ngCount === 0 && l.reviewCount === 0 && (l.pendingCount > 0 ? <VerdictBadge v="PENDING" /> : <VerdictBadge v="OK" />)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="近 30 天缺陷分布" pad={false}>
          {defectBreakdown.length === 0 ? (
            <Empty title="尚無外觀發現" hint="檢驗時記錄的缺陷會累計在這裡" />
          ) : (
            <ul className="divide-y divide-line">
              {defectBreakdown.map((d) => {
                const def = defectByCode(d.defectCode);
                const max = defectBreakdown[0].n;
                return (
                  <li key={`${d.defectCode}-${d.zone}`} className="px-5 py-2.5">
                    <div className="flex items-center justify-between text-[13px]">
                      <span><span className="num font-semibold mr-1.5">{d.defectCode}</span>{def?.nameZh} <span className="text-ink-3">· {zoneByCode(d.zone)?.nameZh}</span></span>
                      <span className="num font-medium">{d.n}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded bg-canvas overflow-hidden">
                      <div className={`h-full ${def?.responsibility === "supplier" ? "bg-warn" : "bg-review"}`} style={{ width: `${(d.n / max) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="px-5 py-2.5 text-[11.5px] text-ink-3 border-t border-line flex gap-3"><span><i className="inline-block w-2 h-2 rounded-sm bg-warn mr-1" />上游責任</span><span><i className="inline-block w-2 h-2 rounded-sm bg-review mr-1" />廠內責任</span></div>
        </Card>
      </div>
    </>
  );
}
