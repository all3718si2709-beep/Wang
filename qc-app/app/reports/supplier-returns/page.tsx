import Link from "next/link";
import { supplierReturns } from "@/lib/queries";
import { PageHeader, Card, Table, Empty, Badge, fmtDay } from "@/components/ui";
import { defectByCode, zoneByCode, DISPOSITION_LABEL } from "@/lib/domain";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

export default async function SupplierReturnsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const now = new Date();
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const rows = await supplierReturns(month);
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.supplierName ?? "(未指定供應商)";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const [y, m] = month.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return (
    <>
      <PageHeader
        title="退供應商報表"
        sub="當月判定拒收且責任歸上游的外觀缺陷,依供應商彙整,附照片與批次證據"
        actions={<div className="flex items-center gap-2 no-print"><Link href={`?month=${prev}`} className="h-10 px-3 inline-flex items-center rounded-md border border-line-2 bg-white text-[14px]">‹</Link><span className="num text-[15px] font-medium">{month}</span><Link href={`?month=${next}`} className="h-10 px-3 inline-flex items-center rounded-md border border-line-2 bg-white text-[14px]">›</Link><PrintButton /></div>}
      />
      {rows.length === 0 ? <Card><Empty title={`${month} 沒有需退回供應商的缺陷`} hint="外觀發現中判定拒收、責任為上游的項目會出現在這裡" /></Card> : (
        <div className="space-y-5">
          {[...groups.entries()].map(([name, items]) => (
            <Card key={name} pad={false} title={<span>{name} <Badge tone="ng">{items.length} 筆 · {new Set(items.map((i) => `${i.lotId}-${i.pieceSeq}`)).size} 件</Badge></span>}>
              <Table>
                <thead><tr><th>日期</th><th>批號</th><th>採購批 / 爐號</th><th>料號</th><th>件</th><th>缺陷</th><th>區域</th><th className="text-right">尺寸 mm</th><th className="text-right">數量</th><th>處置</th><th>照片</th></tr></thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.findingId}>
                      <td className="num text-ink-3">{fmtDay(r.createdAt)}</td>
                      <td><Link href={`/lots/${r.lotId}`} className="num text-brand hover:underline">{r.lotNo}</Link></td>
                      <td className="num">{r.erpPoNo ?? "—"}{r.heatNo ? ` / ${r.heatNo}` : ""}</td>
                      <td className="num">{r.partNo}</td>
                      <td className="num">#{r.pieceSeq}</td>
                      <td>{r.defectCode !== "AI" && <span className="num font-semibold mr-1">{r.defectCode}</span>}{defectByCode(r.defectCode)?.nameZh}</td>
                      <td>{zoneByCode(r.zone)?.nameZh}{r.clockPosition ? <span className="text-ink-3"> · {r.clockPosition} 點鐘</span> : null}</td>
                      <td className="text-right num">{r.sizeMm ?? "—"}</td>
                      <td className="text-right num">{r.count}</td>
                      <td>{r.pieceDisposition ? DISPOSITION_LABEL[r.pieceDisposition] : "—"}</td>
                      <td>{/* eslint-disable-next-line @next/next/no-img-element -- 本機照片 */}
                      {r.photoPath ? <a href={`/api/photos/${r.photoPath}`} target="_blank" rel="noreferrer"><img src={`/api/photos/${r.photoPath}`} alt="" className="h-12 w-12 object-cover rounded" /></a> : <span className="text-ink-3">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
