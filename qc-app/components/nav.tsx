"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ClipboardList, Boxes, Building2, Factory, FileBarChart2, Settings, ShieldCheck, BookOpen } from "lucide-react";
import { useState } from "react";

const items = [
  { href: "/", label: "儀表板", icon: LayoutDashboard, exact: true },
  { href: "/lots", label: "檢驗批", icon: ClipboardList },
  { href: "/parts", label: "料號與規格", icon: Boxes },
  { href: "/customers", label: "客戶", icon: Building2 },
  { href: "/suppliers", label: "供應商", icon: Factory },
  { href: "/reports/supplier-returns", label: "退供應商報表", icon: FileBarChart2 },
  { href: "/settings", label: "設定", icon: Settings },
];

export function Nav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  if (path.endsWith("/report")) return null; // 報告頁全版面
  const active = (it: (typeof items)[number]) => (it.exact ? path === it.href : path.startsWith(it.href));
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="md:hidden fixed top-3 left-3 z-40 h-10 w-10 rounded-md bg-panel border border-line shadow-sm grid place-items-center"
        aria-label="選單"
      >
        <span className="block w-4 h-0.5 bg-ink mb-1" /><span className="block w-4 h-0.5 bg-ink mb-1" /><span className="block w-4 h-0.5 bg-ink" />
      </button>
      <aside
        className={`no-print fixed md:sticky top-0 z-30 h-screen w-60 shrink-0 bg-brand-2 text-white flex flex-col transition-transform md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="px-5 pt-6 pb-5 flex items-center gap-2.5 border-b border-white/10">
          <ShieldCheck className="h-6 w-6 text-blue-200" />
          <div>
            <div className="font-semibold leading-tight">品質檢驗系統</div>
            <div className="text-[11px] text-blue-200/80 tracking-wide">VALVE QC · 規格引擎</div>
          </div>
        </div>
        <nav className="flex-1 py-3">
          {items.map((it) => {
            const Icon = it.icon;
            const on = active(it);
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 mx-2 my-0.5 px-3 h-11 rounded-md text-[14px] transition-colors ${on ? "bg-white/15 text-white font-medium" : "text-blue-100/85 hover:bg-white/10 hover:text-white"}`}
              >
                <Icon className="h-[18px] w-[18px]" />
                {it.label}
              </Link>
            );
          })}
        </nav>
        <a href="/manual.html" target="_blank" rel="noreferrer" className="flex items-center gap-3 mx-2 mb-1 px-3 h-11 rounded-md text-[14px] text-blue-100/85 hover:bg-white/10 hover:text-white">
          <BookOpen className="h-[18px] w-[18px]" />操作說明
        </a>
        <div className="px-5 py-4 text-[11px] text-blue-200/60 border-t border-white/10">資料留在本機 · 不上雲</div>
      </aside>
      {open && <div className="md:hidden fixed inset-0 z-20 bg-black/30" onClick={() => setOpen(false)} />}
    </>
  );
}
