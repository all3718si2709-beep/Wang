import { listCustomers } from "@/lib/queries";
import { createPart } from "@/lib/actions/master";
import { PageHeader, Card, Empty, LinkButton } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { PartFields } from "@/components/part-form";

export const dynamic = "force-dynamic";

export default async function NewPartPage() {
  const customers = await listCustomers();
  return (
    <>
      <PageHeader title="新增料號" crumbs={[{ href: "/parts", label: "料號與規格" }, { label: "新增" }]} />
      <Card className="max-w-3xl">
        {customers.length === 0 ? <Empty title="請先建立客戶" action={<LinkButton href="/customers" variant="secondary">前往客戶</LinkButton>} /> : (
          <ActionForm action={createPart} submitLabel="建立料號,接著填規格"><PartFields customers={customers} /></ActionForm>
        )}
      </Card>
    </>
  );
}
