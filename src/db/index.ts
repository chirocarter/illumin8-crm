// Database client — two modes, same schema and queries:
//   • Local (default): better-sqlite3 file at data/outreach.db — zero setup.
//   • Hosted: set TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN) and the same app
//     talks to Turso (hosted SQLite) — this is the deploy path for Vercel.
// Every call site awaits, so the sync driver is typed through the async
// interface; awaiting a plain value is a no-op.
import Database from "better-sqlite3";
import { createClient } from "@libsql/client";
import { drizzle as drizzleLibsql, type LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

export type DB = LibSQLDatabase<typeof schema>;

function createDb(): DB {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) {
    const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
    return drizzleLibsql(client, { schema });
  }

  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(path.join(dataDir, "outreach.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzleSqlite(sqlite, { schema }) as unknown as DB;
}

const globalForDb = globalThis as unknown as { __db?: DB };

export const db: DB = globalForDb.__db ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.__db = db;

export { schema };
