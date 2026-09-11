import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

const PHOTO_DIR = path.join(process.cwd(), "data", "photos");

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path: segs } = await ctx.params;
  const rel = path.normalize(segs.join("/"));
  if (rel.startsWith("..") || path.isAbsolute(rel)) return new NextResponse("bad path", { status: 400 });
  const full = path.join(PHOTO_DIR, rel);
  try {
    const buf = await fs.readFile(full);
    const type = full.endsWith(".png") ? "image/png" : "image/jpeg";
    return new NextResponse(new Uint8Array(buf), { headers: { "content-type": type, "cache-control": "private, max-age=3600" } });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
