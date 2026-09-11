"use client";
import { useState } from "react";
import type { DimensionSpec } from "@/db/schema";
import { addDimension, updateDimension, deleteDimension } from "@/lib/actions/specs";
import { Button, Input, Select, fmtTol } from "@/components/ui";
import { GAUGES, FREQUENCIES } from "@/lib/domain";
import { Pencil, Trash2, Plus, X } from "lucide-react";

const gaugeOpts = Object.entries(GAUGES);
const freqOpts = Object.entries(FREQUENCIES);

function Row({ specId, dim, onDone }: { specId: number; dim?: DimensionSpec; onDone: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <tr className="bg-brand-soft/40">
      <td colSpan={10} className="!p-2">
        <form
          className="grid grid-cols-[56px_1fr_70px_100px_90px_90px_60px_120px_100px_60px_auto] gap-1.5 items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const fd = new FormData(e.currentTarget);
            const r = dim ? await updateDimension(dim.id, fd) : await addDimension(specId, fd);
            setBusy(false);
            if (!r.ok) setErr(r.error);
            else onDone();
          }}
        >
          <L t="項次"><Input name="seq" type="number" defaultValue={dim?.seq} className="h-9 num" required /></L>
          <L t="特性名稱"><Input name="name" defaultValue={dim?.name} className="h-9" placeholder="外徑" required autoFocus /></L>
          <L t="圖面"><Input name="drawingRef" defaultValue={dim?.drawingRef ?? ""} className="h-9 num" placeholder="A" /></L>
          <L t="標稱"><Input name="nominal" type="number" step="any" defaultValue={dim?.nominal} className="h-9 num" required /></L>
          <L t="下公差"><Input name="tolMinus" type="number" step="any" defaultValue={dim?.tolMinus} className="h-9 num" placeholder="-0.05" required /></L>
          <L t="上公差"><Input name="tolPlus" type="number" step="any" defaultValue={dim?.tolPlus} className="h-9 num" placeholder="0.05" required /></L>
          <L t="單位"><Input name="unit" defaultValue={dim?.unit ?? "mm"} className="h-9" /></L>
          <L t="量具"><Select name="gauge" defaultValue={dim?.gauge ?? "micrometer"} className="h-9">{gaugeOpts.map(([k, g]) => <option key={k} value={k}>{g.nameZh}</option>)}</Select></L>
          <L t="頻率"><Select name="frequency" defaultValue={dim?.frequency ?? "each"} className="h-9">{freqOpts.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></L>
          <L t="小數"><Input name="decimals" type="number" min={0} max={4} defaultValue={dim?.decimals ?? 3} className="h-9 num" /></L>
          <div className="flex items-center gap-2 h-9">
            <label className="flex items-center gap-1 text-[12.5px] whitespace-nowrap"><input type="checkbox" name="critical" defaultChecked={dim?.critical} className="h-4 w-4" />關鍵</label>
            <Button type="submit" size="sm" disabled={busy}>{dim ? "更新" : "加入"}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={onDone}><X className="h-4 w-4" /></Button>
          </div>
          {err && <div className="col-span-full text-[12.5px] text-ng">{err}</div>}
        </form>
      </td>
    </tr>
  );
}
function L({ t, children }: { t: string; children: React.ReactNode }) {
  return <label className="block"><div className="text-[11px] text-ink-3 mb-0.5">{t}</div>{children}</label>;
}

export function DimensionTable({ specId, dims, editable }: { specId: number; dims: DimensionSpec[]; editable: boolean }) {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const nextSeq = (dims.at(-1)?.seq ?? 0) + 1;
  return (
    <div className="overflow-x-auto -mx-5 -mb-5">
      <table className="w-full text-[13.5px] [&_th]:text-left [&_th]:font-medium [&_th]:text-ink-3 [&_th]:text-[12px] [&_th]:px-3 [&_th]:py-2 [&_th]:border-b [&_th]:border-line [&_td]:px-3 [&_td]:py-2 [&_td]:border-b [&_td]:border-line">
        <thead>
          <tr><th className="w-14">項次</th><th>特性</th><th>圖面</th><th className="text-right">標稱</th><th className="text-right">公差</th><th>單位</th><th>量具</th><th>頻率</th><th>關鍵</th><th className="w-24"></th></tr>
        </thead>
        <tbody>
          {dims.map((d) =>
            editing === d.id ? (
              <Row key={d.id} specId={specId} dim={d} onDone={() => setEditing(null)} />
            ) : (
              <tr key={d.id} className="hover:bg-canvas/60">
                <td className="num text-ink-3">{d.seq}</td>
                <td className="font-medium">{d.name}</td>
                <td className="num text-ink-3">{d.drawingRef ?? "—"}</td>
                <td className="text-right num">{d.nominal.toFixed(d.decimals)}</td>
                <td className="text-right num">{fmtTol(d.tolMinus, d.tolPlus, d.decimals)}</td>
                <td className="text-ink-3">{d.unit}</td>
                <td>{GAUGES[d.gauge]?.nameZh}</td>
                <td>{FREQUENCIES[d.frequency]}</td>
                <td>{d.critical && <span className="text-[11px] font-semibold text-brand">CTQ</span>}</td>
                <td className="text-right whitespace-nowrap">
                  {editable && (
                    <>
                      <button className="p-1.5 text-ink-3 hover:text-brand" onClick={() => setEditing(d.id)} aria-label="編輯"><Pencil className="h-4 w-4" /></button>
                      <button className="p-1.5 text-ink-3 hover:text-ng" onClick={async () => { if (confirm(`刪除項次 ${d.seq} ${d.name}?`)) await deleteDimension(d.id); }} aria-label="刪除"><Trash2 className="h-4 w-4" /></button>
                    </>
                  )}
                </td>
              </tr>
            ),
          )}
          {editing === "new" && <Row specId={specId} dim={{ seq: nextSeq } as DimensionSpec} onDone={() => setEditing(null)} />}
          {dims.length === 0 && editing !== "new" && <tr><td colSpan={10} className="text-center text-ink-3 py-8">尚無尺寸項次</td></tr>}
        </tbody>
      </table>
      {editable && editing !== "new" && (
        <div className="px-5 py-3"><Button variant="secondary" size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />新增項次</Button></div>
      )}
    </div>
  );
}
