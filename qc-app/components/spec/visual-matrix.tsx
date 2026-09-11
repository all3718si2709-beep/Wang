"use client";
import { useState } from "react";
import type { VisualSpec } from "@/db/schema";
import { saveVisualMatrix } from "@/lib/actions/specs";
import { Button } from "@/components/ui";
import { DEFECT_CODES, ZONES } from "@/lib/domain";

export function VisualMatrix({ specId, visuals, editable }: { specId: number; visuals: VisualSpec[]; editable: boolean }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const get = (code: string, zone: string) => visuals.find((v) => v.defectCode === code && v.zone === zone);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await saveVisualMatrix(specId, new FormData(e.currentTarget));
        setBusy(false);
        setMsg(r.ok ? { ok: true, text: "外觀矩陣已儲存" } : { ok: false, text: r.error });
      }}
    >
      <div className="overflow-x-auto -mx-5">
        <table className="min-w-[900px] w-full text-[12.5px] border-collapse">
          <thead>
            <tr>
              <th className="sticky left-0 bg-panel text-left px-5 py-2 text-[12px] text-ink-3 font-medium border-b border-line">缺陷類型</th>
              {ZONES.map((z) => <th key={z.code} className="px-2 py-2 text-[12px] text-ink-3 font-medium border-b border-line text-center" title={z.hint}>{z.nameZh}</th>)}
            </tr>
          </thead>
          <tbody>
            {DEFECT_CODES.map((d) => (
              <tr key={d.code} className="border-b border-line">
                <td className="sticky left-0 bg-panel px-5 py-1.5 whitespace-nowrap"><span className="num font-semibold mr-1.5">{d.code}</span>{d.nameZh}<span className="ml-1.5 text-[11px] text-ink-3">{d.responsibility === "supplier" ? "上游" : "廠內"}</span></td>
                {ZONES.map((z) => {
                  const v = get(d.code, z.code);
                  const k = `${d.code}__${z.code}`;
                  return (
                    <td key={z.code} className="px-1.5 py-1 align-top">
                      <Cell k={k} v={v} editable={editable} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" disabled={busy}>{busy ? "儲存中…" : "儲存外觀矩陣"}</Button>
          {msg && <span className={`text-[13px] ${msg.ok ? "text-ok" : "text-ng"}`}>{msg.text}</span>}
        </div>
      )}
    </form>
  );
}

function Cell({ k, v, editable }: { k: string; v?: VisualSpec; editable: boolean }) {
  const [allowed, setAllowed] = useState(v?.allowed ?? false);
  if (!editable) {
    if (!allowed) return <div className="h-9 rounded bg-ng-soft text-ng text-[11.5px] grid place-items-center font-medium">拒收</div>;
    return (
      <div className="h-9 rounded bg-ok-soft text-ok text-[11.5px] grid place-items-center num">
        {v?.maxSizeMm != null ? `≤${v.maxSizeMm}mm` : "不限"}{v?.maxCount != null ? ` ×${v.maxCount}` : ""}
      </div>
    );
  }
  return (
    <div className={`rounded border p-1 ${allowed ? "border-green-200 bg-ok-soft/50" : "border-line bg-canvas/50"}`}>
      <label className="flex items-center gap-1 text-[11.5px] cursor-pointer select-none">
        <input type="checkbox" name={`${k}__allowed`} checked={allowed} onChange={(e) => setAllowed(e.target.checked)} className="h-4 w-4" />允許
      </label>
      {allowed && (
        <div className="mt-1 grid grid-cols-2 gap-1">
          <input name={`${k}__size`} type="number" step="0.01" min="0" placeholder="≤mm" defaultValue={v?.maxSizeMm ?? ""} className="h-7 w-full px-1 text-[11.5px] num rounded border border-line-2 bg-white" title="單一缺陷最大尺寸 mm" />
          <input name={`${k}__count`} type="number" step="1" min="1" placeholder="≤個" defaultValue={v?.maxCount ?? ""} className="h-7 w-full px-1 text-[11.5px] num rounded border border-line-2 bg-white" title="同區最多幾個" />
        </div>
      )}
    </div>
  );
}
