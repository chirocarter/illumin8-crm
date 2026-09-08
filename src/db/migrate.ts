// Applies drizzle migrations to ONE of two databases, and makes you say which.
//
// Why the flag exists: `loadEnvLocal()` reads `.env.turso` BEFORE `.env.local`,
// so on a developer machine `TURSO_DATABASE_URL` is essentially always set.
// This script used to branch on that variable alone, which meant the obvious
// command — `npm run db:migrate` — silently migrated PRODUCTION. It was
// documented in the README as a trap and the documentation still failed: a
// migration intended for the local file landed on Turso.
//
//   npm run db:migrate            → local data/outreach.db, always
//   npm run db:migrate -- --prod  → hosted Turso database
//
// Production intent is now something you type, not something the environment
// decides for you.
import path from "path";
import fs from "fs";
import { loadEnvLocal } from "./env";

loadEnvLocal();

const migrationsFolder = path.join(process.cwd(), "drizzle");
const args = process.argv.slice(2);
const wantsProd = args.includes("--prod");
const unknown = args.filter((a) => a !== "--prod");

/** Hostname only — never the auth token, and never a URL with credentials in it. */
function safeTarget(url: string): string {
  try { const u = new URL(url); return u.host || `${u.protocol}${u.pathname}`; } catch { return "(unparseable URL)"; }
}

function rule() { console.log("─".repeat(60)); }

async function main() {
  if (unknown.length) {
    console.error(`Unrecognized argument(s): ${unknown.join(" ")}`);
    console.error("Usage: tsx src/db/migrate.ts [--prod]");
    process.exit(1);
  }

  const hostedUrl = process.env.TURSO_DATABASE_URL;

  if (wantsProd) {
    // Asked for production but nothing is configured. Falling back to the local
    // file here would report "migrations applied" while production stayed
    // untouched — the quiet failure this whole guard exists to prevent.
    if (!hostedUrl) {
      console.error("--prod was passed but TURSO_DATABASE_URL is not set.");
      console.error("Nothing was migrated. Configure .env.turso, or drop --prod to migrate locally.");
      process.exit(1);
    }
    rule();
    console.log("  TARGET: PRODUCTION (Turso)");
    console.log(`  host:   ${safeTarget(hostedUrl)}`);
    console.log("  Applying migrations to the LIVE database.");
    rule();

    const { createClient } = await import("@libsql/client");
    const { drizzle } = await import("drizzle-orm/libsql");
    const { migrate } = await import("drizzle-orm/libsql/migrator");
    const client = createClient({
      url: hostedUrl,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    await migrate(drizzle(client), { migrationsFolder });
    console.log(`Migrations applied to PRODUCTION (${safeTarget(hostedUrl)}).`);
    return;
  }

  rule();
  console.log("  TARGET: LOCAL  data/outreach.db");
  if (hostedUrl) {
    // Say it out loud. The variable is set on every dev machine, and staying
    // quiet about ignoring it is how the old behaviour surprised people.
    console.log(`  TURSO_DATABASE_URL is set (${safeTarget(hostedUrl)}) and is being IGNORED.`);
    console.log("  Pass --prod if you meant to migrate production.");
  }
  rule();

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
