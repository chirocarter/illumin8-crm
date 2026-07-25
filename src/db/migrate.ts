// Applies drizzle migrations to whichever database the environment points at:
// the local file by default, or Turso when TURSO_DATABASE_URL is set.
import path from "path";
import fs from "fs";
import { loadEnvLocal } from "./env";

loadEnvLocal();

const migrationsFolder = path.join(process.cwd(), "drizzle");

async function main() {
  if (process.env.TURSO_DATABASE_URL) {
    const { createClient } = await import("@libsql/client");
    const { drizzle } = await import("drizzle-orm/libsql");
    const { migrate } = await import("drizzle-orm/libsql/migrator");
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    await migrate(drizzle(client), { migrationsFolder });
    console.log(`Migrations applied to ${process.env.TURSO_DATABASE_URL}`);
  } else {
    const { default: Database } = await import("better-sqlite3");
    const { drizzle } = await import("drizzle-orm/better-sqlite3");
    const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
    const dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const sqlite = new Database(path.join(dataDir, "outreach.db"));
    sqlite.pragma("journal_mode = WAL");
    migrate(drizzle(sqlite), { migrationsFolder });
    sqlite.close();
    console.log("Migrations applied to local data/outreach.db");
  }
}

main();
