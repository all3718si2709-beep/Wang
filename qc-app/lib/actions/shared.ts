import "server-only";
import { z } from "zod";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

export type ActionResult = { ok: true; id?: number } | { ok: false; error: string };

export function fail(error: string): ActionResult {
  return { ok: false, error };
}

/** 把 zod 錯誤變成一行中文 */
export function zodMessage(e: z.ZodError) {
  return e.issues.map((i) => `${i.path.join(".")}:${i.message}`).join(";");
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
export const optStr = (fd: FormData, k: string) => str(fd, k) || null;
export const num = (fd: FormData, k: string) => {
  const s = str(fd, k);
  return s === "" ? NaN : Number(s);
};
export const optNum = (fd: FormData, k: string) => {
  const s = str(fd, k);
  return s === "" ? null : Number(s);
};
export const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true" || fd.get(k) === "1";

export async function audit(entity: string, entityId: number, action: string, detail?: unknown, actor?: string | null) {
  await db.insert(auditLog).values({ entity, entityId, action, detail: detail == null ? null : JSON.stringify(detail), actor: actor ?? null });
}
