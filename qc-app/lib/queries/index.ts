import "server-only";
import { db, ensureMigrated } from "@/db";
import {
  customers, suppliers, parts, specVersions, dimensionSpecs, visualSpecs, lots, pieces, measurements, visualFindings, settings,
} from "@/db/schema";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { dimensionStats } from "@/lib/engine";
import { isAttributeGauge } from "@/lib/domain";

/** 所有 query 進來先確保 migration 跑過 */
async function ready() {
  await ensureMigrated();
}

// ---------- 基本檔 ----------
export async function listCustomers() {
  await ready();
  return db.select().from(customers).orderBy(asc(customers.code));
}
export async function getCustomer(id: number) {
  await ready();
  return db.query.customers.findFirst({ where: eq(customers.id, id) });
}
export async function listSuppliers() {
  await ready();
  return db.select().from(suppliers).orderBy(asc(suppliers.code));
}
export async function getSupplier(id: number) {
  await ready();
  return db.query.suppliers.findFirst({ where: eq(suppliers.id, id) });
}

// ---------- 料號 / 規格 ----------
export async function listParts() {
  await ready();
  const rows = await db
    .select({
      id: parts.id, partNo: parts.partNo, name: parts.name, drawingNo: parts.drawingNo, drawingRev: parts.drawingRev,
      nominalSizeInch: parts.nominalSizeInch, customerId: parts.customerId, customerName: customers.name, customerCode: customers.code,
      activeVersion: sql<number | null>`(select max(version) from spec_versions sv where sv.part_id = ${parts.id} and sv.status = 'active')`,
      draftVersion: sql<number | null>`(select max(version) from spec_versions sv where sv.part_id = ${parts.id} and sv.status = 'draft')`,
      dimCount: sql<number>`(select count(*) from dimension_specs ds join spec_versions sv on sv.id = ds.spec_version_id where sv.part_id = ${parts.id} and sv.status = 'active')`,
    })
    .from(parts)
    .innerJoin(customers, eq(customers.id, parts.customerId))
    .orderBy(asc(customers.code), asc(parts.partNo));
  return rows;
}

export async function getPart(id: number) {
  await ready();
  const part = await db.query.parts.findFirst({ where: eq(parts.id, id) });
  if (!part) return null;
  const customer = await db.query.customers.findFirst({ where: eq(customers.id, part.customerId) });
  const versions = await db.select().from(specVersions).where(eq(specVersions.partId, id)).orderBy(desc(specVersions.version));
  return { ...part, customer: customer!, versions };
}

export async function getActiveSpecVersion(partId: number) {
  await ready();
  return db.query.specVersions.findFirst({ where: and(eq(specVersions.partId, partId), eq(specVersions.status, "active")) });
}

export async function getSpecVersion(id: number) {
  await ready();
  const v = await db.query.specVersions.findFirst({ where: eq(specVersions.id, id) });
  if (!v) return null;
  const part = await getPart(v.partId);
  const dims = await db.select().from(dimensionSpecs).where(eq(dimensionSpecs.specVersionId, id)).orderBy(asc(dimensionSpecs.seq));
  const visuals = await db.select().from(visualSpecs).where(eq(visualSpecs.specVersionId, id));
  const lotCount = await db.select({ n: sql<number>`count(*)` }).from(lots).where(eq(lots.specVersionId, id));
  return { ...v, part: part!, dims, visuals, lotCount: lotCount[0]?.n ?? 0 };
}

// ---------- 批 ----------
export interface LotFilter {
  status?: "open" | "closed";
  partId?: number;
  limit?: number;
}
export async function listLots(filter: LotFilter = {}) {
  await ready();
  const conds = [];
  if (filter.status) conds.push(eq(lots.status, filter.status));
  if (filter.partId) conds.push(eq(lots.partId, filter.partId));
  const rows = await db
    .select({
      id: lots.id, lotNo: lots.lotNo, inspectionType: lots.inspectionType, status: lots.status, disposition: lots.disposition,
      quantity: lots.quantity, createdAt: lots.createdAt, closedAt: lots.closedAt, inspector: lots.inspector,
      erpWorkOrder: lots.erpWorkOrder, partId: parts.id, partNo: parts.partNo, partName: parts.name, customerName: customers.name,
      supplierName: suppliers.name,
      okCount: sql<number>`(select count(*) from pieces p where p.lot_id = ${lots.id} and coalesce(p.final_verdict, p.engine_verdict) = 'OK')`,
      ngCount: sql<number>`(select count(*) from pieces p where p.lot_id = ${lots.id} and coalesce(p.final_verdict, p.engine_verdict) = 'NG')`,
      reviewCount: sql<number>`(select count(*) from pieces p where p.lot_id = ${lots.id} and p.final_verdict is null and p.engine_verdict = 'REVIEW')`,
      pendingCount: sql<number>`(select count(*) from pieces p where p.lot_id = ${lots.id} and p.final_verdict is null and p.engine_verdict = 'PENDING')`,
    })
    .from(lots)
    .innerJoin(parts, eq(parts.id, lots.partId))
    .innerJoin(customers, eq(customers.id, parts.customerId))
    .leftJoin(suppliers, eq(suppliers.id, lots.supplierId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(lots.createdAt))
    .limit(filter.limit ?? 200);
  return rows;
}

export type LotDetail = NonNullable<Awaited<ReturnType<typeof getLotDetail>>>;

export async function getLotDetail(id: number) {
  await ready();
  const lot = await db.query.lots.findFirst({ where: eq(lots.id, id) });
  if (!lot) return null;
  const part = await getPart(lot.partId);
  const supplier = lot.supplierId ? await getSupplier(lot.supplierId) : null;
  const spec = await db.query.specVersions.findFirst({ where: eq(specVersions.id, lot.specVersionId) });
  const dims = await db.select().from(dimensionSpecs).where(eq(dimensionSpecs.specVersionId, lot.specVersionId)).orderBy(asc(dimensionSpecs.seq));
  const visuals = await db.select().from(visualSpecs).where(eq(visualSpecs.specVersionId, lot.specVersionId));
  const pcs = await db.select().from(pieces).where(eq(pieces.lotId, id)).orderBy(asc(pieces.seqNo));
  const pieceIds = pcs.map((p) => p.id);
  const meas = pieceIds.length ? await db.select().from(measurements).where(inArray(measurements.pieceId, pieceIds)) : [];
  const finds = pieceIds.length
    ? await db.select().from(visualFindings).where(inArray(visualFindings.pieceId, pieceIds)).orderBy(asc(visualFindings.id))
    : [];

  const piecesFull = pcs.map((p) => ({
    ...p,
    effectiveVerdict: (p.finalVerdict ?? p.engineVerdict) as "OK" | "NG" | "REVIEW" | "PENDING",
    measurements: meas.filter((m) => m.pieceId === p.id),
    findings: finds.filter((f) => f.pieceId === p.id),
  }));

  const stats = dims.map((d) => {
    const ms = meas.filter((m) => m.dimensionSpecId === d.id);
    if (isAttributeGauge(d.gauge)) {
      // 塞規 / 環規:只有通 / 不通,沒有 min/max/Cpk
      const ok = ms.filter((m) => m.attribute === "go").length;
      return { dim: d, stats: { n: ms.length, min: null, max: null, mean: null, stdev: null, cp: null, cpk: null, ok, warn: 0, ng: ms.length - ok } };
    }
    return { dim: d, stats: dimensionStats(ms.map((m) => ({ value: m.value, judgement: m.judgement })), d) };
  });

  const summary = {
    total: piecesFull.length,
    ok: piecesFull.filter((p) => p.effectiveVerdict === "OK").length,
    ng: piecesFull.filter((p) => p.effectiveVerdict === "NG").length,
    review: piecesFull.filter((p) => p.effectiveVerdict === "REVIEW").length,
    pending: piecesFull.filter((p) => p.effectiveVerdict === "PENDING").length,
    supplierNg: finds.filter((f) => f.judgement === "NG" && f.responsibility === "supplier").length,
    inhouseNg: finds.filter((f) => f.judgement === "NG" && f.responsibility === "inhouse").length,
  };

  return { ...lot, part: part!, supplier, spec: spec!, dims, visuals, pieces: piecesFull, stats, summary };
}

// ---------- 儀表板 ----------
export async function dashboardData() {
  await ready();
  const open = await listLots({ status: "open", limit: 20 });
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceIso = since.toISOString();
  const [recent] = await db
    .select({
      lots: sql<number>`count(distinct ${lots.id})`,
      pieces: sql<number>`(select count(*) from pieces p join lots l on l.id = p.lot_id where l.created_at >= ${sinceIso})`,
      ng: sql<number>`(select count(*) from pieces p join lots l on l.id = p.lot_id where l.created_at >= ${sinceIso} and coalesce(p.final_verdict, p.engine_verdict) = 'NG')`,
      supplierNg: sql<number>`(select count(*) from visual_findings f join pieces p on p.id = f.piece_id join lots l on l.id = p.lot_id where l.created_at >= ${sinceIso} and f.judgement = 'NG' and f.responsibility = 'supplier')`,
      inhouseNg: sql<number>`(select count(*) from visual_findings f join pieces p on p.id = f.piece_id join lots l on l.id = p.lot_id where l.created_at >= ${sinceIso} and f.judgement = 'NG' and f.responsibility = 'inhouse')`,
    })
    .from(lots)
    .where(gte(lots.createdAt, sinceIso));

  const defectBreakdown = await db
    .select({ defectCode: visualFindings.defectCode, zone: visualFindings.zone, n: sql<number>`sum(${visualFindings.count})` })
    .from(visualFindings)
    .innerJoin(pieces, eq(pieces.id, visualFindings.pieceId))
    .innerJoin(lots, eq(lots.id, pieces.lotId))
    .where(gte(lots.createdAt, sinceIso))
    .groupBy(visualFindings.defectCode, visualFindings.zone)
    .orderBy(desc(sql`sum(${visualFindings.count})`))
    .limit(8);

  return { open, recent, defectBreakdown };
}

// ---------- 退供應商報表 ----------
export async function supplierReturns(month: string /* YYYY-MM */) {
  await ready();
  const start = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const rows = await db
    .select({
      findingId: visualFindings.id, defectCode: visualFindings.defectCode, zone: visualFindings.zone, sizeMm: visualFindings.sizeMm,
      count: visualFindings.count, clockPosition: visualFindings.clockPosition, photoPath: visualFindings.photoPath, judgement: visualFindings.judgement,
      note: visualFindings.note, createdAt: visualFindings.createdAt,
      pieceSeq: pieces.seqNo, pieceDisposition: pieces.disposition,
      lotId: lots.id, lotNo: lots.lotNo, erpPoNo: lots.erpPoNo, heatNo: lots.heatNo,
      partNo: parts.partNo, partName: parts.name,
      supplierId: suppliers.id, supplierName: suppliers.name, supplierCode: suppliers.code,
    })
    .from(visualFindings)
    .innerJoin(pieces, eq(pieces.id, visualFindings.pieceId))
    .innerJoin(lots, eq(lots.id, pieces.lotId))
    .innerJoin(parts, eq(parts.id, lots.partId))
    .leftJoin(suppliers, eq(suppliers.id, lots.supplierId))
    .where(and(eq(visualFindings.responsibility, "supplier"), eq(visualFindings.judgement, "NG"), gte(visualFindings.createdAt, start), lt(visualFindings.createdAt, next)))
    .orderBy(asc(suppliers.code), asc(lots.lotNo), asc(pieces.seqNo));
  return rows;
}

// ---------- 設定 ----------
export async function getSettings() {
  await ready();
  const rows = await db.select().from(settings);
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string>;
}
