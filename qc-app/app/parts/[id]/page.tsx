import Link from "next/link";
import { notFound } from "next/navigation";
import { getPart, listCustomers } from "@/lib/queries";
import { updatePart } from "@/lib/actions/master";
import { createSpecVersion } from "@/lib/actions/specs";
import { PageHeader, Card, Table, Badge, LinkButton, Empty, fmtDate } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { PartFields } from "@/components/part-form";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const part = await getPart(Number(id));
  if (!part) notFound();
  const customers = await listCustomers();
  const active = part.versions.find((v) => v.status === "active");
  const draft = part.versions.find((v) => v.status === "draft");
  return (
    <>
      <PageHeader
        title={<span className="num">{part.partNo}</span>}
        sub={`${part.name} · ${part.customer.name}`}
        crumbs={[{ href: "/parts", label: "料號與規格" }, { label: part.partNo }]}
        actions={active && <LinkButton href={`/lots/new?partId=${part.id}`} variant="secondary">用此料號開批</LinkButton>}
      />
      <div className="grid lg:grid-cols-[1fr_420px] gap-5">
        <Card
          title="允收標準版本"
          pad={false}
          actions={
            <ActionForm action={async () => { "use server"; return createSpecVersion(part.id); }} size="sm" variant={draft ? "secondary" : "primary"} className="[&>div]:mt-0" submitLabel={<><Plus className="h-4 w-4" />{draft ? "繼續編輯草稿" : active ? "以現行版本開新版" : "建立第一版"}</>} />
          }
        >
          {part.versions.length === 0 ? <Empty title="尚無規格" hint="建立第一版後填尺寸項次與外觀允收矩陣,再按生效" /> : (
            <Table>
              <thead><tr><th>版本</th><th>狀態</th><th>生效</th><th>停用</th><th>備註</th><th></th></tr></thead>
              <tbody>
                {part.versions.map((v) => (
                  <tr key={v.id}>
                    <td className="num font-medium">v{v.version}</td>
                    <td>{v.status === "active" ? <Badge tone="ok">生效中</Badge> : v.status === "draft" ? <Badge tone="warn">草稿</Badge> : <Badge>已停用</Badge>}</td>
                    <td className="num text-ink-3">{fmtDate(v.activatedAt)}</td>
                    <td className="num text-ink-3">{fmtDate(v.retiredAt)}</td>
                    <td className="text-ink-3">{v.notes ?? "—"}</td>
                    <td className="text-right"><Link href={`/parts/${part.id}/spec/${v.id}`} className="text-[13px] text-brand hover:underline">{v.status === "draft" ? "編輯" : "檢視"}</Link></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card title="料號基本資料">
          <ActionForm action={updatePart.bind(null, part.id)} submitLabel="更新"><PartFields customers={customers} part={part} /></ActionForm>
        </Card>
      </div>
    </>
  );
}
