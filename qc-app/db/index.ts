import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./data/qc.db";

if (url.startsWith("file:")) {
  fs.mkdirSync(path.dirname(url.slice("file:".length)), { recursive: true });
}

const client = createClient({ url });
export const db = drizzle(client, { schema });

let migrated: Promise<void> | null = null;
/** 啟動時自動套用 migration,廠內安裝只要 pnpm start */
export function ensureMigrated() {
  migrated ??= migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") }).then(async () => {
    await client.execute("PRAGMA foreign_keys = ON");
  });
  return migrated;
}
