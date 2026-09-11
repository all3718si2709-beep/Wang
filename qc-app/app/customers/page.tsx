import { listCustomers } from "@/lib/queries";
import { createCustomer, updateCustomer } from "@/lib/actions/master";
import { PageHeader, Card, Field, Input, Table, Empty } from "@/components/ui";
import { ActionForm } from "@/components/action-form";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const rows = await listCustomers();
  return (
    <>
      <PageHeader title="客戶" sub="規格由客戶給:允收標準掛在「客戶 → 料號」之下" />
      <div className="grid lg:grid-cols-[1fr_340px] gap-5">
        <Card pad={false} title="客戶清單">
          {rows.length === 0 ? <Empty title="尚無客戶" /> : (
            <Table>
              <thead><tr><th>代號</th><th>名稱</th><th>備註</th><th></th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td colSpan={4} className="!p-0">
                      <ActionForm action={updateCustomer.bind(null, c.id)} submitLabel="更新" size="sm" variant="secondary" className="grid grid-cols-[110px_1fr_1fr_auto] items-center gap-2 px-3 py-2 [&>div]:mt-0">
                        <Input name="code" defaultValue={c.code} className="h-9 num" />
                        <Input name="name" defaultValue={c.name} className="h-9" />
                        <Input name="notes" defaultValue={c.notes ?? ""} className="h-9" placeholder="備註" />
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card title="新增客戶">
          <ActionForm action={createCustomer} submitLabel="新增" resetOnSuccess>
            <div className="space-y-3">
              <Field label="代號 *"><Input name="code" placeholder="C001" className="num" required /></Field>
              <Field label="名稱 *"><Input name="name" required /></Field>
              <Field label="備註"><Input name="notes" /></Field>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
