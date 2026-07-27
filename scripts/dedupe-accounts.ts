// Removes exact-duplicate account rows created by importing the same CSV twice.
//
// The key is the FULL row content, not the name: two records sharing a name but
// differing in phone/status/notes are different records (e.g. the same gym on
// both a "partners" list and a "leads" list) and both survive. Of each identical
// set the LOWEST id is kept, so the original import wins and ids stay stable.
//
// Dry-run by default. Pass --apply to actually delete.
import { createClient } from "@libsql/client";
import { loadEnvLocal } from "../src/db/env";

loadEnvLocal();
const url = process.env.TURSO_DATABASE_URL;
if (!url) { console.error("No TURSO_DATABASE_URL — refusing to run."); process.exit(1); }
const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
const APPLY = process.argv.includes("--apply");

const KEY = `lower(trim(name))||'|'||coalesce(vertical,'')||'|'||coalesce(area,'')||'|'||coalesce(status,'')
           ||'|'||coalesce(phone,'')||'|'||coalesce(email,'')||'|'||coalesce(address,'')
           ||'|'||coalesce(website,'')||'|'||coalesce(notes,'')||'|'||coalesce(owner_name,'')`;

const DOOMED = `SELECT id FROM accounts WHERE id NOT IN (SELECT min(id) FROM accounts GROUP BY ${KEY})`;

const REFS = ["contacts", "opportunities", "events", "activities", "tasks", "partners",
              "campaigns", "appointments", "leads", "projects", "documents", "account_tags"];

async function main() {
  const before = Number((await db.execute("SELECT count(*) AS c FROM accounts")).rows[0].c);
  const doomed = Number((await db.execute(`SELECT count(*) AS c FROM (${DOOMED})`)).rows[0].c);

  // Refuse to delete anything still referenced — that would orphan real work.
  let refs = 0;
  for (const t of REFS) {
    const c = Number((await db.execute(`SELECT count(*) AS c FROM ${t} WHERE account_id IN (${DOOMED})`)).rows[0].c);
    if (c) { console.error(`ABORT: ${c} ${t} row(s) reference copies that would be deleted.`); refs += c; }
  }
  if (refs) process.exit(1);

  console.log(`accounts before : ${before}`);
  console.log(`exact copies    : ${doomed}`);
  console.log(`will remain     : ${before - doomed}`);

  if (!APPLY) {
    console.log("\nDRY RUN — nothing deleted. Re-run with --apply to commit.");
    return;
  }

  await db.execute(`DELETE FROM accounts WHERE id IN (${DOOMED})`);
  const after = Number((await db.execute("SELECT count(*) AS c FROM accounts")).rows[0].c);
  const left = Number((await db.execute(
    `SELECT count(*) AS c FROM (SELECT ${KEY} AS k FROM accounts GROUP BY k HAVING count(*) > 1)`)).rows[0].c);

  console.log(`\nDELETED ${before - after} rows.`);
  console.log(`accounts now    : ${after}`);
  console.log(`duplicates left : ${left}${left === 0 ? "  ✓" : "  <-- unexpected"}`);
}

main();
