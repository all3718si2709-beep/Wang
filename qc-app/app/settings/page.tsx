import { getSettings } from "@/lib/queries";
import { saveSettings } from "@/lib/actions/master";
import { PageHeader, Card, Field, Input, Textarea } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { DEFECT_CODES, ZONES } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await getSettings();
  return (
    <>
      <PageHeader title="設定" sub="報告抬頭與系統參考資料" />
      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="公司抬頭(印在檢驗報告上)">
          <ActionForm action={saveSettings}>
            <div className="space-y-3">
              <Field label="公司名稱"><Input name="company.name" defaultValue={s["company.name"] ?? ""} /></Field>
              <Field label="地址"><Input name="company.address" defaultValue={s["company.address"] ?? ""} /></Field>
              <Field label="電話"><Input name="company.phone" defaultValue={s["company.phone"] ?? ""} /></Field>
              <Field label="報告頁尾聲明" hint="例如:本報告僅對本批送檢樣品負責"><Textarea name="report.footer" defaultValue={s["report.footer"] ?? ""} /></Field>
            </div>
          </ActionForm>
        </Card>
        <div className="space-y-5">
          <Card title="外觀缺陷分類(MSS SP-55 + 自訂)" pad={false}>
            <table className="w-full text-[13px]">
              <thead><tr className="text-[12px] text-ink-3"><th className="text-left px-5 py-2">代號</th><th className="text-left py-2">中文</th><th className="text-left py-2">English</th><th className="text-left py-2 pr-5">預設責任</th></tr></thead>
              <tbody>
                {DEFECT_CODES.map((d) => (
                  <tr key={d.code} className="border-t border-line">
                    <td className="px-5 py-1.5 num font-semibold">{d.code}</td>
                    <td className="py-1.5">{d.nameZh}{d.common && <span className="ml-1.5 text-[11px] text-brand">常見</span>}</td>
                    <td className="py-1.5 text-ink-3">{d.nameEn}</td>
                    <td className="py-1.5 pr-5">{d.responsibility === "supplier" ? "上游鑄造廠" : "廠內"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-5 py-3 text-[12px] text-ink-3 border-t border-line">I~XII 為 MSS SP-55 分類摘要,正式允收等級請對照購買的標準文本與比對板。</p>
          </Card>
          <Card title="檢驗區域" pad={false}>
            <table className="w-full text-[13px]">
              <tbody>
                {ZONES.map((z) => (
                  <tr key={z.code} className="border-t border-line first:border-t-0"><td className="px-5 py-1.5 font-medium w-32">{z.nameZh}</td><td className="py-1.5 text-ink-3">{z.hint}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </>
  );
}
