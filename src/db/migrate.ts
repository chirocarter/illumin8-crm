// Applies drizzle migrations to ONE of two databases, and makes you say which.
//
//   npm run db:migrate            → local data/outreach.db, always
//   npm run db:migrate -- --prod  → hosted Turso database
//
// The reasoning, and the incident that produced it, live in src/db/target.ts.
// Every database-touching script in this repo uses that same resolver so there
// is one convention to learn rather than four.
import path from "path";
import fs from "fs";
import { resolveTarget } from "./target";

const migrationsFolder = path.join(process.cwd(), "drizzle");

async function main() {
  const target = resolveTarget({
    command: "db:migrate",
    known: [],
    operation: "apply any pending drizzle migrations",
  });

  if (target.prod) {
    const { createClient } = await import("@libsql/client");
    const { drizzle } = await import("drizzle-orm/libsql");
    const { migrate } = await import("drizzle-orm/libsql/migrator");
    const client = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    await migrate(drizzle(client), { migrationsFolder });
    console.log(`Migrations applied to PRODUCTION (${target.host}).`);
    return;
  }

  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const sqlite = new Database(path.join(dataDir, "outreach.db"));
  sqlite.pragma("journal_mode = WAL");
  migrate(drizzle(sqlite), { migrationsFolder });
  sqlite.close();
  console.log("Migrations applied to LOCAL data/outreach.db.");
}

main();
