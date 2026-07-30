// Maps free-text statuses that arrived via CSV import onto the app's official
// vocabulary, so those accounts appear in stage columns and status filters.
//
// Evidence-based: none of the imported values had any activity or events behind
// them, so "general contact" becomes New Prospect rather than Contacted —
// claiming 21 untouched businesses were contacted would be wrong.
//
// Dry-run by default. Pass --apply to write. Backs up first either way.
import { createClient } from "@libsql/client";
import { loadEnvLocal } from "../src/db/env";
import fs from "fs";
import path from "path";

loadEnvLocal();
const url = process.env.TURSO_DATABASE_URL;
const db = createClient({ url: url!, authToken: process.env.TURSO_AUTH_TOKEN });
const APPLY = process.argv.includes("--apply");

const MAP: Record<string, string> = {
  "prospect": "New Prospect",
  "cold lead": "New Prospect",
  "general contact": "New Prospect",   // zero activity — not actually contacted
  "warm lead": "Interested",
  "hot lead": "Interested",
  "qr code scans": "Interested",       // they self-submitted via a QR form
  "current partner": "Active Partner",
  "nurture": "Nurture",
  "closed - non responsive": "Nurture", // reachable later, not disqualified
  "closed - not a fit": "Not a Fit",
};

async function main() {
  console.log(`target: ${url ? "Turso (hosted)" : "local"}\n`);

  const rows = (await db.execute("SELECT id, name, status FROM accounts")).rows as
    unknown as { id: number; name: string; status: string }[];

  const changes = rows
    .map((r) => ({ ...r, to: MAP[String(r.status).trim().toLowerCase()] }))
    .filter((r) => r.to && r.to !== r.status);

  const summary: Record<string, { to: string; n: number }> = {};
  for (const c of changes) {
    const k = c.status;
    summary[k] = { to: c.to!, n: (summary[k]?.n ?? 0) + 1 };
  }

  console.log("from                        ->  to                 count");
  for (const [from, { to, n }] of Object.entries(summary).sort((a, b) => b[1].n - a[1].n)) {
    console.log(`${from.padEnd(28)}->  ${to.padEnd(18)} ${n}`);
  }
  console.log(`\ntotal accounts affected: ${changes.length}`);

  // Always snapshot before a write — Turso's free tier has no point-in-time restore.
  const dir = path.join(process.cwd(), "backups");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `account-statuses-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(rows, null, 2));
  console.log(`\nbacked up all ${rows.length} account statuses -> ${path.relative(process.cwd(), file)}`);

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to commit.");
    return;
  }

  for (const c of changes) {
    await db.execute({ sql: "UPDATE accounts SET status = ? WHERE id = ?", args: [c.to!, c.id] });
  }
  console.log(`\nUPDATED ${changes.length} accounts.`);

  const left = (await db.execute("SELECT status, count(*) n FROM accounts GROUP BY status ORDER BY n DESC")).rows;
  console.log("\nstatuses now in use:");
  for (const r of left) console.log(`   ${String(r.status).padEnd(20)} ${r.n}`);
}

main();
