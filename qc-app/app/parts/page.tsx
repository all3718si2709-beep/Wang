import Link from "next/link";
import { listParts } from "@/lib/queries";
import { PageHeader, Card, Table, Badge, LinkButton, Empty } from "@/components/ui";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PartsPage() {
  const rows = await listParts();
  return (
    <>
      <PageHeader title="料號與規格" sub="每個料號有版本化的允收標準:草稿可編,生效後不可改,要改就開新版" actions={<LinkButton href="/parts/new"><Plus className="h-4 w-4" />新增料號</LinkButton>} />
      <Card pad={false}>
        {rows.length === 0 ? <Empty title="尚無料號" action={<LinkButton href="/parts/new" variant="secondary">新增料號</LinkButton>} /> : (
          <Table>
            <thead><tr><th>客戶</th><th>料號</th><th>品名</th><th>圖號 / 版次</th><th className="text-right">吋</th><th>生效規格</th><th className="text-right">尺寸項次</th><th></th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="text-ink-3">{p.customerCode}</td>
                  <td><Link href={`/parts/${p.id}`} className="font-medium text-brand hover:underline">{p.partNo}</Link></td>
                  <td>{p.name}</td>
                  <td className="num">{p.drawingNo ?? "—"}{p.drawingRev ? ` / ${p.drawingRev}` : ""}</td>
                  <td className="text-right num">{p.nominalSizeInch ?? "—"}</td>
                  <td>{p.activeVersion != null ? <Badge tone="ok">v{p.activeVersion} 生效中</Badge> : <Badge tone="warn">未生效</Badge>}{p.draftVersion != null && <Badge tone="neutral">v{p.draftVersion} 草稿</Badge>}</td>
                  <td className="text-right num">{p.dimCount}</td>
                  <td className="text-right">{p.activeVersion != null && <Link href={`/lots/new?partId=${p.id}`} className="text-[13px] text-brand hover:underline">開批</Link>}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
