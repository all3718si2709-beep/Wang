"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, suppliers, parts, settings } from "@/db/schema";
import { fail, str, optStr, optNum, zodMessage, type ActionResult } from "./shared";

const codeName = z.object({ code: z.string().min(1, "必填").max(20), name: z.string().min(1, "必填").max(100), notes: z.string().nullable() });

export async function createCustomer(fd: FormData): Promise<ActionResult> {
  const p = codeName.safeParse({ code: str(fd, "code"), name: str(fd, "name"), notes: optStr(fd, "notes") });
  if (!p.success) return fail(zodMessage(p.error));
  try {
    await db.insert(customers).values(p.data);
  } catch {
    return fail("客戶代號已存在");
  }
  revalidatePath("/customers");
  return { ok: true };
}

export async function updateCustomer(id: number, fd: FormData): Promise<ActionResult> {
  const p = codeName.safeParse({ code: str(fd, "code"), name: str(fd, "name"), notes: optStr(fd, "notes") });
  if (!p.success) return fail(zodMessage(p.error));
  await db.update(customers).set(p.data).where(eq(customers.id, id));
  revalidatePath("/customers");
  return { ok: true };
}

export async function createSupplier(fd: FormData): Promise<ActionResult> {
  const p = codeName.safeParse({ code: str(fd, "code"), name: str(fd, "name"), notes: optStr(fd, "notes") });
  if (!p.success) return fail(zodMessage(p.error));
  try {
    await db.insert(suppliers).values(p.data);
  } catch {
    return fail("供應商代號已存在");
  }
  revalidatePath("/suppliers");
  return { ok: true };
}

export async function updateSupplier(id: number, fd: FormData): Promise<ActionResult> {
  const p = codeName.safeParse({ code: str(fd, "code"), name: str(fd, "name"), notes: optStr(fd, "notes") });
  if (!p.success) return fail(zodMessage(p.error));
  await db.update(suppliers).set(p.data).where(eq(suppliers.id, id));
  revalidatePath("/suppliers");
  return { ok: true };
}

const partSchema = z.object({
  customerId: z.number().int().positive("請選客戶"),
  partNo: z.string().min(1, "必填").max(60),
  name: z.string().min(1, "必填").max(120),
  drawingNo: z.string().nullable(),
  drawingRev: z.string().nullable(),
  nominalSizeInch: z.number().positive().nullable(),
  material: z.string().nullable(),
  notes: z.string().nullable(),
});

function parsePart(fd: FormData) {
  return partSchema.safeParse({
    customerId: Number(str(fd, "customerId")),
    partNo: str(fd, "partNo"),
    name: str(fd, "name"),
    drawingNo: optStr(fd, "drawingNo"),
    drawingRev: optStr(fd, "drawingRev"),
    nominalSizeInch: optNum(fd, "nominalSizeInch"),
    material: optStr(fd, "material"),
    notes: optStr(fd, "notes"),
  });
}

export async function createPart(fd: FormData): Promise<ActionResult> {
  const p = parsePart(fd);
  if (!p.success) return fail(zodMessage(p.error));
  let id: number;
  try {
    const [row] = await db.insert(parts).values(p.data).returning({ id: parts.id });
    id = row.id;
  } catch {
    return fail("此客戶已有相同料號");
  }
  revalidatePath("/parts");
  redirect(`/parts/${id}`);
}

export async function updatePart(id: number, fd: FormData): Promise<ActionResult> {
  const p = parsePart(fd);
  if (!p.success) return fail(zodMessage(p.error));
  await db.update(parts).set(p.data).where(eq(parts.id, id));
  revalidatePath(`/parts/${id}`);
  revalidatePath("/parts");
  return { ok: true };
}

export async function saveSettings(fd: FormData): Promise<ActionResult> {
  const keys = ["company.name", "company.address", "company.phone", "report.footer"];
  for (const key of keys) {
    const value = str(fd, key);
    await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
  }
  revalidatePath("/settings");
  return { ok: true };
}
