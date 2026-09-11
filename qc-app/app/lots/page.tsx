import Link from "next/link";
import { listLots } from "@/lib/queries";
import { PageHeader, Card, Table, VerdictBadge, Badge, LinkButton, Empty, fmtDay } from "@/components/ui";
import { INSPECTION_TYPES, LOT_DISPOSITION_LABEL } from "@/lib/domain";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LotsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const st = status === "closed" ? "closed" : status === "open" ? "open" : undefined;
  const rows = await listLots({ status: st });
  const tab = (v: string | undefined, label: string) => (
    <Link href={v ? `/lots?status=${v}` : "/lots"} className={`h-9 px-3 inline-flex items-center rounded-md text-[13.5px] ${st === v ? "bg-brand text-white" : "bg-white border border-line-2 text-ink-2 hover:bg-canvas"}`}>{label}</Link>
  );
  return (
    <>
      <PageHeader title="檢驗批" sub="每一批對應鼎新工單 / 採購批,判定依開批當下的規格版本" actions={<LinkButton href="/lots/new"><Plus className="h-4 w-4" />開新檢驗批</LinkButton>} />
      <div className="mb-4 flex gap-2">{tab(undefined, "全部")}{tab("open", "進行中")}{tab("closed", "已結批")}</div>
      <Card pad={false}>
        {rows.length === 0 ? (
          <Empty title="沒有符合的批" />
        ) : (
          <Table>
            <thead><tr><th>批號</th><th>料號</th><th>類別</th><th>ERP 工單</th><th>供應商</th><th>日期</th><th className="text-right">數量</th><th className="text-right">OK / NG</th><th>狀態</th></tr></thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td><Link href={`/lots/${l.id}`} className="font-medium text-brand hover:underline num">{l.lotNo}</Link></td>
                  <td><div className="font-medium">{l.partNo}</div><div className="text-[12px] text-ink-3">{l.partName} · {l.customerName}</div></td>
                  <td><Badge tone="brand">{l.inspectionType} {INSPECTION_TYPES[l.inspectionType]?.nameZh}</Badge></td>
                  <td className="num">{l.erpWorkOrder ?? "—"}</td>
                  <td>{l.supplierName ?? "—"}</td>
                  <td className="num text-ink-3">{fmtDay(l.createdAt)}</td>
                  <td className="text-right num">{l.quantity}</td>
                  <td className="text-right num"><span className="text-ok">{l.okCount}</span> / <span className={l.ngCount ? "text-ng font-semibold" : ""}>{l.ngCount}</span>{l.reviewCount > 0 && <span className="text-review"> +{l.reviewCount} 待複判</span>}</td>
                  <td>{l.status === "closed" ? <Badge tone={l.disposition === "accept" ? "ok" : l.disposition === "reject" ? "ng" : "warn"}>已結批 · {LOT_DISPOSITION_LABEL[l.disposition ?? ""]}</Badge> : l.pendingCount > 0 ? <VerdictBadge v="PENDING" /> : <Badge tone="brand">進行中</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
