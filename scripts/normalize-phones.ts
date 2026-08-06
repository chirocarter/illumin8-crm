// Brings phone numbers already in the database into the one format new entries
// now use. Only rewrites numbers formatPhone recognises — international
// numbers, extensions and partials are left exactly as they are.
//
// Dry-run by default. Pass --apply to write. Backs up first either way.
import { loadEnvLocal } from "../src/db/env";
import fs from "fs";
import path from "path";

async function main() {
  loadEnvLocal();
  const { db } = await import("../src/db");
  const { formatPhone } = await import("../src/lib/phone");
  const { sql } = await import("drizzle-orm");
  const APPLY = process.argv.includes("--apply");

  console.log(`target: ${process.env.TURSO_DATABASE_URL ? "Turso (hosted)" : "local file"}\n`);

  const tables = ["accounts", "contacts", "leads"] as const;
  const snapshot: Record<string, unknown[]> = {};
  const planned: { table: string; id: number; from: string; to: string }[] = [];

  for (const t of tables) {
    const rows = (await db.all(sql.raw(
      `SELECT id, phone FROM ${t} WHERE phone IS NOT NULL AND trim(phone) <> ''`))) as
      { id: number; phone: string }[];
    snapshot[t] = rows;
    for (const r of rows) {
      const next = formatPhone(r.phone);
      if (next && next !== r.phone) planned.push({ table: t, id: r.id, from: r.phone, to: next });
    }
  }

  const byTable: Record<string, number> = {};
  for (const p of planned) byTable[p.table] = (byTable[p.table] ?? 0) + 1;
  console.log("rows to reformat:", planned.length ? JSON.stringify(byTable) : "none");
  for (const p of planned.slice(0, 12)) {
    console.log(`   ${p.table.padEnd(9)} #${String(p.id).padEnd(4)} ${p.from.padEnd(24)} -> ${p.to}`);
  }
  if (planned.length > 12) console.log(`   …and ${planned.length - 12} more`);

  const dir = path.join(process.cwd(), "backups");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `phones-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));
  console.log(`\nbacked up every phone -> ${path.relative(process.cwd(), file)}`);

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to commit.");
    return;
  }
  for (const p of planned) {
    await db.run(sql.raw(`UPDATE ${p.table} SET phone = '${p.to.replace(/'/g, "''")}' WHERE id = ${p.id}`));
  }
  console.log(`\nUPDATED ${planned.length} phone numbers.`);
}

main();
