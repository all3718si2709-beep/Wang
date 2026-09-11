import { notFound } from "next/navigation";
import { getLotDetail } from "@/lib/queries";
import { PageHeader, Badge } from "@/components/ui";
import { CmmImport } from "@/components/lot/cmm-import";
import { INSPECTION_TYPES } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lot = await getLotDetail(Number(id));
  if (!lot) notFound();
  return (
    <>
      <PageHeader
        title={<span>匯入三次元報告 <Badge tone="brand">{lot.inspectionType} {INSPECTION_TYPES[lot.inspectionType]?.nameZh}</Badge></span>}
        sub={<span><span className="num">{lot.lotNo}</span> · {lot.part.partNo} · {lot.part.name} · 批量 {lot.quantity} · 規格 v{lot.spec.version}</span>}
        crumbs={[{ href: "/lots", label: "檢驗批" }, { href: `/lots/${lot.id}`, label: lot.lotNo }, { label: "匯入三次元" }]}
      />
      {lot.status === "closed" ? (
        <div className="rounded-md border border-amber-200 bg-warn-soft px-4 py-3 text-[14px] text-warn">此批已結批,請先回批頁「重開此批」再匯入。</div>
      ) : (
        <CmmImport lotId={lot.id} quantity={lot.quantity} />
      )}
    </>
  );
}
