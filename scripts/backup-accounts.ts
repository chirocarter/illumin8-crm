// Dumps the live accounts table to a timestamped JSON file before any
// destructive operation. Turso's free tier has no point-in-time restore, so
// this file IS the undo button. Restore with scripts/restore-accounts.ts.
import fs from "fs";
import path from "path";
import { createClient } from "@libsql/client";
import { loadEnvLocal } from "../src/db/env";

loadEnvLocal();
const url = process.env.TURSO_DATABASE_URL;
if (!url) { console.error("No TURSO_DATABASE_URL — refusing to run."); process.exit(1); }
const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

async function main() {
  const dir = path.join(process.cwd(), "backups");
  fs.mkdirSync(dir, { recursive: true });

  const rows = (await db.execute("SELECT * FROM accounts ORDER BY id")).rows;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = path.join(dir, `accounts-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(rows, null, 2), "utf8");

  console.log(`backed up ${rows.length} accounts`);
  console.log(`-> ${file}`);
  console.log(`   ${(fs.statSync(file).size / 1024).toFixed(1)} KB`);
}

main();
