import Link from "next/link";
import { notFound } from "next/navigation";
import { getLotDetail, listSuppliers } from "@/lib/queries";
import { updateLotHeader, closeLot, reopenLot } from "@/lib/actions/lots";
import { PageHeader, Card, Badge, Field, Input, Select, Textarea, LinkButton, Stat, fmtDate } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { Workspace } from "@/components/lot/workspace";
import { INSPECTION_TYPES, LOT_DISPOSITION_LABEL } from "@/lib/domain";
import { FileText, Lock, Unlock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lot = await getLotDetail(Number(id));
  if (!lot) notFound();
  const suppliers = await listSuppliers();
  const closed = lot.status === "closed";
  const s = lot.summary;
  return (
    <>
      <PageHeader
        title={<span className="num">{lot.lotNo} <Badge tone="brand">{lot.inspectionType} {INSPECTION_TYPES[lot.inspectionType]?.nameZh}</Badge> {closed && <Badge tone={lot.disposition === "accept" ? "ok" : lot.disposition === "reject" ? "ng" : "warn"}><Lock className="h-3 w-3 mr-1" />已結批 · {LOT_DISPOSITION_LABEL[lot.disposition ?? ""]}</Badge>}</span>}
        sub={<span><Link href={`/parts/${lot.part.id}`} className="num text-brand hover:underline">{lot.part.partNo}</Link> · {lot.part.name} · {lot.part.customer.name} · 規格 <Link href={`/parts/${lot.part.id}/spec/${lot.specVersionId}`} className="text-brand hover:underline">v{lot.spec.version}</Link> · 開批 {fmtDate(lot.createdAt)}</span>}
        crumbs={[{ href: "/lots", label: "檢驗批" }, { label: lot.lotNo }]}
        actions={<LinkButton href={`/lots/${lot.id}/report`} variant="secondary"><FileText className="h-4 w-4" />檢驗報告</LinkButton>}
      />

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-5">
        <Stat label="批量" value={s.total} />
        <Stat label="允收" value={s.ok} tone="ok" />
        <Stat label="拒收" value={s.ng} tone={s.ng ? "ng" : "neutral"} />
        <Stat label="待複判" value={s.review} tone={s.review ? "review" : "neutral"} />
        <Stat label="未完成" value={s.pending} tone="neutral" />
        <Stat label="上游 / 廠內缺陷" value={<span>{s.supplierNg}<span className="text-ink-3 text-[18px]"> / </span>{s.inhouseNg}</span>} tone="warn" />
      </div>

      <Workspace lot={lot} />

      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <Card title="批資料(對應鼎新)">
          <ActionForm action={updateLotHeader.bind(null, lot.id)} submitLabel="更新">
            <fieldset disabled={closed} className="grid md:grid-cols-2 gap-3">
              <Field label="ERP 工單號"><Input name="erpWorkOrder" defaultValue={lot.erpWorkOrder ?? ""} className="num" /></Field>
              <Field label="ERP 採購批號"><Input name="erpPoNo" defaultValue={lot.erpPoNo ?? ""} className="num" /></Field>
              <Field label="毛胚供應商"><Select name="supplierId" defaultValue={lot.supplierId ?? ""}><option value="">—</option>{suppliers.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</Select></Field>
              <Field label="爐號"><Input name="heatNo" defaultValue={lot.heatNo ?? ""} className="num" /></Field>
              <Field label="檢驗員"><Input name="inspector" defaultValue={lot.inspector ?? ""} /></Field>
              <Field label="備註" className="md:col-span-2"><Textarea name="notes" defaultValue={lot.notes ?? ""} /></Field>
            </fieldset>
          </ActionForm>
        </Card>
        <Card title={closed ? "批已結" : "結批"}>
          {closed ? (
            <div className="space-y-3">
              <p className="text-[13.5px] text-ink-2">結批於 {fmtDate(lot.closedAt)},結論「{LOT_DISPOSITION_LABEL[lot.disposition ?? ""]}」。結批後資料鎖定;若需補量測或修正,先重開。</p>
              <ActionForm action={async () => { "use server"; return reopenLot(lot.id); }} submitLabel={<><Unlock className="h-4 w-4" />重開此批</>} variant="secondary" className="[&>div]:mt-0" />
            </div>
          ) : (
            <ActionForm action={closeLot.bind(null, lot.id)} submitLabel="結批並鎖定" variant="primary" confirm="結批後不可再輸入量測與外觀,確定?">
              <p className="mb-3 text-[13px] text-ink-3">結批前所有件必須是「允收」或「拒收」;待複判件請在件面板做人工覆判。</p>
              <Field label="批結論 *">
                <Select name="disposition" defaultValue="" required>
                  <option value="" disabled>選擇</option>
                  <option value="accept">允收 — 全批放行</option>
                  <option value="reject">拒收 — 全批退回 / 隔離</option>
                  <option value="deviation">特採 — 有 NG 件但經核准放行(限定條件)</option>
                </Select>
              </Field>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
