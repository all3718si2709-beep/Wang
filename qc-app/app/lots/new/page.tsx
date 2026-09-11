import { listParts, listSuppliers } from "@/lib/queries";
import { createLot } from "@/lib/actions/lots";
import { PageHeader, Card, Field, Input, Select, Textarea, Empty, LinkButton } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { INSPECTION_TYPES } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function NewLotPage({ searchParams }: { searchParams: Promise<{ partId?: string }> }) {
  const { partId } = await searchParams;
  const [parts, suppliers] = await Promise.all([listParts(), listSuppliers()]);
  const ready = parts.filter((p) => p.activeVersion != null);
  return (
    <>
      <PageHeader title="開新檢驗批" crumbs={[{ href: "/lots", label: "檢驗批" }, { label: "新增" }]} sub="批號留空會自動編 L-年月日-流水號;判定規格取該料號目前生效版本" />
      <Card className="max-w-3xl">
        {ready.length === 0 ? (
          <Empty title="還沒有任何料號有生效的允收標準" hint="先到「料號與規格」建立料號、填尺寸項次與外觀允收,再按「生效」" action={<LinkButton href="/parts" variant="secondary">前往料號與規格</LinkButton>} />
        ) : (
          <ActionForm action={createLot} submitLabel="建立批並開始檢驗" size="lg">
            <div className="grid md:grid-cols-2 gap-4">
              <Field label="料號 *" className="md:col-span-2">
                <Select name="partId" defaultValue={partId ?? ""} required>
                  <option value="" disabled>選擇料號</option>
                  {ready.map((p) => <option key={p.id} value={p.id}>{p.customerCode} · {p.partNo} — {p.name}(規格 v{p.activeVersion})</option>)}
                </Select>
              </Field>
              <Field label="檢驗類別 *">
                <Select name="inspectionType" defaultValue="FQC" required>
                  {Object.entries(INSPECTION_TYPES).map(([k, v]) => <option key={k} value={k}>{k} {v.nameZh} — {v.desc}</option>)}
                </Select>
              </Field>
              <Field label="數量(件)*"><Input name="quantity" type="number" min={1} max={5000} inputMode="numeric" required className="num" /></Field>
              <Field label="批號" hint="留空自動編號"><Input name="lotNo" placeholder="自動" className="num" /></Field>
              <Field label="檢驗員"><Input name="inspector" /></Field>
              <Field label="ERP 工單號" hint="鼎新工單"><Input name="erpWorkOrder" className="num" /></Field>
              <Field label="ERP 採購批號" hint="鼎新採購單 / 進料單"><Input name="erpPoNo" className="num" /></Field>
              <Field label="毛胚供應商">
                <Select name="supplierId" defaultValue="">
                  <option value="">—</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
                </Select>
              </Field>
              <Field label="爐號 / 批號(供應商)"><Input name="heatNo" className="num" /></Field>
              <Field label="備註" className="md:col-span-2"><Textarea name="notes" /></Field>
            </div>
          </ActionForm>
        )}
      </Card>
    </>
  );
}
