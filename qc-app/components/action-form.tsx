"use client";
import { useActionState } from "react";
import type { ReactNode } from "react";
import type { ActionResult } from "@/lib/actions/shared";
import { Button } from "./ui";

/**
 * 表單外殼:統一處理 pending、錯誤訊息、成功提示。
 * action 內若 redirect,不會回到這裡(正常)。
 */
export function ActionForm({
  action, children, submitLabel = "儲存", successLabel = "已儲存", className = "", variant = "primary", size = "md", confirm, resetOnSuccess,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  children?: ReactNode;
  submitLabel?: ReactNode;
  successLabel?: string;
  className?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  confirm?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: (ActionResult & { at?: number }) | null, fd: FormData) => {
      const r = await action(fd);
      return { ...r, at: Date.now() };
    },
    null,
  );
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      ref={(el) => {
        if (el && resetOnSuccess && state?.ok) el.reset();
      }}
    >
      {children}
      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" disabled={pending} variant={variant} size={size}>
          {pending ? "處理中…" : submitLabel}
        </Button>
        {state && !state.ok && <span className="text-[13px] text-ng">{state.error}</span>}
        {state?.ok && <span className="text-[13px] text-ok">{successLabel}</span>}
      </div>
    </form>
  );
}
