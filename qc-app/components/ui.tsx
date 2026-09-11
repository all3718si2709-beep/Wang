import Link from "next/link";
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { VERDICT_LABEL } from "@/lib/domain";

export function PageHeader({ title, sub, actions, crumbs }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; crumbs?: { href?: string; label: string }[] }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {crumbs && (
          <div className="mb-1.5 text-[12.5px] text-ink-3 flex items-center gap-1.5">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-line-2">/</span>}
                {c.href ? <Link href={c.href} className="hover:text-brand">{c.label}</Link> : <span>{c.label}</span>}
              </span>
            ))}
          </div>
        )}
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight">{title}</h1>
        {sub && <div className="mt-1 text-[13.5px] text-ink-3">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "", title, actions, pad = true }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; pad?: boolean }) {
  return (
    <section className={`bg-panel border border-line rounded-lg shadow-[0_1px_2px_rgba(15,23,42,.04)] ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-line">
          <h2 className="text-[14px] font-semibold text-ink-2">{title}</h2>
          {actions}
        </header>
      )}
      <div className={pad ? "p-5" : ""}>{children}</div>
    </section>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost"; size?: "sm" | "md" | "lg" };
const btnBase = "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";
const btnVariant = {
  primary: "bg-brand text-white hover:bg-brand-2",
  secondary: "bg-white border border-line-2 text-ink hover:bg-canvas",
  danger: "bg-white border border-red-200 text-ng hover:bg-red-50",
  ghost: "text-ink-2 hover:bg-canvas",
};
const btnSize = { sm: "h-8 px-2.5 text-[13px]", md: "h-10 px-3.5 text-[14px]", lg: "h-12 px-5 text-[15px]" };
export function Button({ variant = "primary", size = "md", className = "", ...rest }: BtnProps) {
  return <button className={`${btnBase} ${btnVariant[variant]} ${btnSize[size]} ${className}`} {...rest} />;
}
export function LinkButton({ href, variant = "primary", size = "md", className = "", children }: { href: string; variant?: keyof typeof btnVariant; size?: keyof typeof btnSize; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${btnBase} ${btnVariant[variant]} ${btnSize[size]} ${className}`}>
      {children}
    </Link>
  );
}

const ctl = "w-full h-10 px-3 rounded-md border border-line-2 bg-white text-[14px] outline-none focus:border-brand focus:ring-[3px] focus:ring-brand-soft placeholder:text-ink-3/60";
export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${ctl} ${className}`} {...rest} />;
}
export function Select({ className = "", ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${ctl} ${className}`} {...rest} />;
}
export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${ctl} h-auto py-2 min-h-20 ${className}`} {...rest} />;
}
export function Field({ label, children, hint, className = "" }: { label: ReactNode; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <div className="mb-1 text-[12.5px] font-medium text-ink-2">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[12px] text-ink-3">{hint}</div>}
    </label>
  );
}

const verdictCls: Record<string, string> = {
  OK: "bg-ok-soft text-ok border-green-200",
  WARN: "bg-warn-soft text-warn border-amber-200",
  NG: "bg-ng-soft text-ng border-red-200",
  REVIEW: "bg-review-soft text-review border-violet-200",
  PENDING: "bg-pending-soft text-pending border-line-2",
};
export function VerdictBadge({ v, size = "sm" }: { v: string; size?: "sm" | "md" }) {
  return (
    <span className={`inline-flex items-center rounded border font-semibold ${size === "sm" ? "h-6 px-1.5 text-[11.5px]" : "h-7 px-2 text-[13px]"} ${verdictCls[v] ?? verdictCls.PENDING}`}>
      {VERDICT_LABEL[v] ?? v}
    </span>
  );
}
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "brand" | "ok" | "ng" | "warn" }) {
  const t = {
    neutral: "bg-canvas text-ink-2 border-line",
    brand: "bg-brand-soft text-brand-2 border-blue-200",
    ok: "bg-ok-soft text-ok border-green-200",
    ng: "bg-ng-soft text-ng border-red-200",
    warn: "bg-warn-soft text-warn border-amber-200",
  }[tone];
  return <span className={`inline-flex items-center h-6 px-1.5 rounded border text-[11.5px] font-medium ${t}`}>{children}</span>;
}

export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-[13.5px] [&_th]:text-left [&_th]:font-medium [&_th]:text-ink-3 [&_th]:text-[12px] [&_th]:tracking-wide [&_th]:px-3 [&_th]:py-2 [&_th]:border-b [&_th]:border-line [&_td]:px-3 [&_td]:py-2.5 [&_td]:border-b [&_td]:border-line [&_tbody_tr:last-child_td]:border-b-0 [&_tbody_tr:hover]:bg-canvas/60">
        {children}
      </table>
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="py-12 text-center">
      <div className="text-[15px] font-medium text-ink-2">{title}</div>
      {hint && <div className="mt-1 text-[13px] text-ink-3">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, tone = "neutral", sub }: { label: string; value: ReactNode; tone?: "neutral" | "ok" | "ng" | "warn" | "review" | "brand"; sub?: ReactNode }) {
  const c = { neutral: "text-ink", ok: "text-ok", ng: "text-ng", warn: "text-warn", review: "text-review", brand: "text-brand" }[tone];
  return (
    <div className="bg-panel border border-line rounded-lg px-4 py-3">
      <div className="text-[12px] text-ink-3">{label}</div>
      <div className={`mt-0.5 text-[26px] font-semibold num leading-tight ${c}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}

export const fmt = (v: number | null | undefined, d = 3) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));
export const fmtTol = (minus: number, plus: number, d = 3) => {
  if (minus === 0 && plus === 0) return "±0";
  if (minus === 0) return `+${plus.toFixed(d)} / 0`;
  if (plus === 0) return `0 / ${minus.toFixed(d)}`;
  if (Math.abs(minus) === plus) return `±${plus.toFixed(d)}`;
  return `+${plus.toFixed(d)} / ${minus.toFixed(d)}`;
};
export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
export const fmtDay = (iso: string | null | undefined) => (iso ? fmtDate(iso).slice(0, 10) : "—");
