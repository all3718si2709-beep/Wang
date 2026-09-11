import { notFound } from "next/navigation";
import { getSpecVersion } from "@/lib/queries";
import { activateSpecVersion, deleteDraftVersion, updateSpecMeta } from "@/lib/actions/specs";
import { PageHeader, Card, Badge, Field, Input, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { DimensionTable } from "@/components/spec/dimension-table";
import { VisualMatrix } from "@/components/spec/visual-matrix";

export const dynamic = "force-dynamic";

export default async function SpecPage({ params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { id, versionId } = await params;
  const spec = await getSpecVersion(Number(versionId));
  if (!spec || spec.partId !== Number(id)) notFound();
  const editable = spec.status === "draft";
  return (
    <>
      <PageHeader
        title={<span>允收標準 <span className="num">v{spec.version}</span> {spec.status === "active" ? <Badge tone="ok">生效中</Badge> : editable ? <Badge tone="warn">草稿</Badge> : <Badge>已停用</Badge>}</span>}
        sub={<span><span className="num">{spec.part.partNo}</span> · {spec.part.name} · {spec.part.customer.name}{spec.lotCount > 0 && ` · 已被 ${spec.lotCount} 批引用`}</span>}
        crumbs={[{ href: "/parts", label: "料號與規格" }, { href: `/parts/${spec.partId}`, label: spec.part.partNo }, { label: `v${spec.version}` }]}
        actions={
          editable && (
            <>
              <ActionForm action={async () => { "use server"; return deleteDraftVersion(spec.id); }} submitLabel="刪除草稿" variant="danger" confirm="刪除此草稿版本?" className="[&>div]:mt-0" />
              <ActivateForm specId={spec.id} dimCount={spec.dims.length} />
            </>
          )
        }
      />
      {!editable && <div className="mb-4 rounded-md border border-blue-200 bg-brand-soft px-4 py-2.5 text-[13px] text-brand-2">此版本已{spec.status === "active" ? "生效" : "停用"},內容鎖定以保判定可追溯。要修改請回料號頁「開新版」,新版會複製此版內容。</div>}

      <div className="space-y-5">
        <Card title="一、尺寸項次" actions={<span className="text-[12px] text-ink-3">下公差填正負皆可,系統一律視為負向;上下公差皆 0 代表無公差(不允許)</span>}>
          <DimensionTable specId={spec.id} dims={spec.dims} editable={editable} />
        </Card>
        <Card title="二、外觀允收矩陣(缺陷類型 × 區域)" actions={<span className="text-[12px] text-ink-3">未勾「允許」= 該區出現即拒收;勾了但不填上限 = 不限</span>}>
          <VisualMatrix specId={spec.id} visuals={spec.visuals} editable={editable} />
        </Card>
        <Card title="三、判定參數">
          <ActionForm action={updateSpecMeta.bind(null, spec.id)} submitLabel="儲存參數">
            <div className="grid md:grid-cols-[200px_1fr] gap-4">
              <Field label="尺寸警戒比例" hint="用掉公差帶多少比例標黃,預設 0.8"><Input name="warnRatio" type="number" step="0.05" min="0.1" max="1" defaultValue={spec.warnRatio} className="num" disabled={!editable} /></Field>
              <Field label="版本備註" hint="例如:客戶 2026-09 圖面 Rev C 變更密封面公差"><Textarea name="notes" defaultValue={spec.notes ?? ""} disabled={!editable} /></Field>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}

function ActivateForm({ specId, dimCount }: { specId: number; dimCount: number }) {
  return (
    <ActionForm action={async () => { "use server"; return activateSpecVersion(specId); }} submitLabel="生效此版本" confirm="生效後此版本不可再修改,現行生效版本會轉為停用。確定?" className="[&>div]:mt-0">
      {dimCount === 0 && <span className="sr-only">尚無尺寸項次</span>}
    </ActionForm>
  );
}
