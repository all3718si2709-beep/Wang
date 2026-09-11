"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { lots, pieces, specVersions } from "@/db/schema";
import { audit, fail, str, optStr, num, zodMessage, type ActionResult } from "./shared";

const lotSchema = z.object({
  partId: z.number().int().positive("請選料號"),
  inspectionType: z.enum(["IQC", "IPQC", "FQC", "FAI"]),
  lotNo: z.string().min(1, "必填").max(40),
  erpWorkOrder: z.string().nullable(),
  erpPoNo: z.string().nullable(),
  supplierId: z.number().int().positive().nullable(),
  heatNo: z.string().nullable(),
  quantity: z.number().int().min(1, "數量至少 1").max(5000, "單批最多 5000 件"),
  inspector: z.string().nullable(),
  notes: z.string().nullable(),
});

/** 批號自動編:L-YYMMDD-NNN */
async function nextLotNo() {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `L-${ymd}-`;
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(lots).where(sql`${lots.lotNo} like ${prefix + "%"}`);
  return `${prefix}${String(n + 1).padStart(3, "0")}`;
}

export async function createLot(fd: FormData): Promise<ActionResult> {
  const supplierRaw = str(fd, "supplierId");
  const p = lotSchema.safeParse({
    partId: Number(str(fd, "partId")),
    inspectionType: str(fd, "inspectionType"),
    lotNo: str(fd, "lotNo") || (await nextLotNo()),
    erpWorkOrder: optStr(fd, "erpWorkOrder"),
    erpPoNo: optStr(fd, "erpPoNo"),
    supplierId: supplierRaw ? Number(supplierRaw) : null,
    heatNo: optStr(fd, "heatNo"),
    quantity: num(fd, "quantity"),
    inspector: optStr(fd, "inspector"),
    notes: optStr(fd, "notes"),
  });
  if (!p.success) return fail(zodMessage(p.error));

  const active = await db.query.specVersions.findFirst({ where: and(eq(specVersions.partId, p.data.partId), eq(specVersions.status, "active")) });
  if (!active) return fail("此料號尚無生效的允收標準,請先到料號頁建立並生效規格");

  let lotId: number;
  try {
    const [row] = await db.insert(lots).values({ ...p.data, specVersionId: active.id }).returning({ id: lots.id });
    lotId = row.id;
  } catch {
    return fail("批號已存在");
  }
  await db.insert(pieces).values(Array.from({ length: p.data.quantity }, (_, i) => ({ lotId, seqNo: i + 1 })));
  await audit("lot", lotId, "create", { specVersionId: active.id });
  revalidatePath("/lots");
  revalidatePath("/");
  redirect(`/lots/${lotId}`);
}

export async function updateLotHeader(lotId: number, fd: FormData): Promise<ActionResult> {
  const lot = await db.query.lots.findFirst({ where: eq(lots.id, lotId) });
  if (!lot) return fail("批不存在");
  if (lot.status === "closed") return fail("已結批不可修改");
  const supplierRaw = str(fd, "supplierId");
  await db
    .update(lots)
    .set({
      erpWorkOrder: optStr(fd, "erpWorkOrder"),
      erpPoNo: optStr(fd, "erpPoNo"),
      supplierId: supplierRaw ? Number(supplierRaw) : null,
      heatNo: optStr(fd, "heatNo"),
      inspector: optStr(fd, "inspector"),
      notes: optStr(fd, "notes"),
    })
    .where(eq(lots.id, lotId));
  revalidatePath(`/lots/${lotId}`);
  return { ok: true };
}

/** 結批:要求沒有 PENDING / REVIEW 件 */
export async function closeLot(lotId: number, fd: FormData): Promise<ActionResult> {
  const lot = await db.query.lots.findFirst({ where: eq(lots.id, lotId) });
  if (!lot) return fail("批不存在");
  const disposition = str(fd, "disposition");
  if (!["accept", "reject", "deviation"].includes(disposition)) return fail("請選擇批結論");
  const [{ unresolved }] = await db
    .select({ unresolved: sql<number>`count(*)` })
    .from(pieces)
    .where(and(eq(pieces.lotId, lotId), sql`${pieces.finalVerdict} is null and ${pieces.engineVerdict} in ('PENDING','REVIEW')`));
  if (unresolved > 0) return fail(`還有 ${unresolved} 件未完成或待複判,不能結批`);
  await db
    .update(lots)
    .set({ status: "closed", disposition: disposition as "accept" | "reject" | "deviation", closedAt: new Date().toISOString() })
    .where(eq(lots.id, lotId));
  await audit("lot", lotId, "close", { disposition });
  revalidatePath(`/lots/${lotId}`);
  revalidatePath("/lots");
  revalidatePath("/");
  return { ok: true };
}

export async function reopenLot(lotId: number): Promise<ActionResult> {
  await db.update(lots).set({ status: "open", disposition: null, closedAt: null }).where(eq(lots.id, lotId));
  await audit("lot", lotId, "reopen");
  revalidatePath(`/lots/${lotId}`);
  revalidatePath("/lots");
  return { ok: true };
}
