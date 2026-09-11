import { listSuppliers } from "@/lib/queries";
import { createSupplier, updateSupplier } from "@/lib/actions/master";
import { PageHeader, Card, Field, Input, Table, Empty } from "@/components/ui";
import { ActionForm } from "@/components/action-form";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const rows = await listSuppliers();
  return (
    <>
      <PageHeader title="毛胚供應商" sub="上游鑄造廠。鑄造缺陷(MSS SP-55 I~XII 類)責任預設歸上游,月底可拉退回報表" />
      <div className="grid lg:grid-cols-[1fr_340px] gap-5">
        <Card pad={false} title="供應商清單">
          {rows.length === 0 ? <Empty title="尚無供應商" /> : (
            <Table>
              <thead><tr><th>代號</th><th>名稱</th><th>備註</th><th></th></tr></thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td colSpan={4} className="!p-0">
                      <ActionForm action={updateSupplier.bind(null, s.id)} submitLabel="更新" size="sm" variant="secondary" className="grid grid-cols-[110px_1fr_1fr_auto] items-center gap-2 px-3 py-2 [&>div]:mt-0">
                        <Input name="code" defaultValue={s.code} className="h-9 num" />
                        <Input name="name" defaultValue={s.name} className="h-9" />
                        <Input name="notes" defaultValue={s.notes ?? ""} className="h-9" placeholder="備註" />
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card title="新增供應商">
          <ActionForm action={createSupplier} submitLabel="新增" resetOnSuccess>
            <div className="space-y-3">
              <Field label="代號 *"><Input name="code" placeholder="S001" className="num" required /></Field>
              <Field label="名稱 *"><Input name="name" required /></Field>
              <Field label="備註"><Input name="notes" /></Field>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
