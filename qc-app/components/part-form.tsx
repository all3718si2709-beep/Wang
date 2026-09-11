import { Field, Input, Select, Textarea } from "@/components/ui";
import type { Customer, Part } from "@/db/schema";

export function PartFields({ customers, part }: { customers: Customer[]; part?: Part }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Field label="客戶 *">
        <Select name="customerId" defaultValue={part?.customerId ?? ""} required>
          <option value="" disabled>選擇客戶</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}
        </Select>
      </Field>
      <Field label="料號 *"><Input name="partNo" defaultValue={part?.partNo} className="num" required /></Field>
      <Field label="品名 *"><Input name="name" defaultValue={part?.name} placeholder={`例:8" 閥板 Class 150`} required /></Field>
      <Field label="標稱尺寸(吋)"><Input name="nominalSizeInch" type="number" step="0.5" min={0} defaultValue={part?.nominalSizeInch ?? ""} className="num" /></Field>
      <Field label="圖號"><Input name="drawingNo" defaultValue={part?.drawingNo ?? ""} className="num" /></Field>
      <Field label="圖面版次"><Input name="drawingRev" defaultValue={part?.drawingRev ?? ""} className="num" /></Field>
      <Field label="材質"><Input name="material" defaultValue={part?.material ?? ""} placeholder="例:ASTM A216 WCB" /></Field>
      <Field label="備註" className="md:col-span-2"><Textarea name="notes" defaultValue={part?.notes ?? ""} /></Field>
    </div>
  );
}
