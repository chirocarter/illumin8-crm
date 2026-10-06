import type { Client } from "@libsql/client";
import type Database from "better-sqlite3";

export type WriteStatement = { sql: string; args: (string | number | null)[] };

/** One transaction on either driver; never pass an async callback to SQLite. */
export async function atomicWrite(client: Client | Database.Database, statements: WriteStatement[]) {
  if ("batch" in client) {
    return (await client.batch(statements, "write")).map((r) => r.rowsAffected);
  }
  return client.transaction(() => statements.map((s) =>
    client.prepare(s.sql).run(...s.args).changes
  )).immediate();
}
