import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { createClient } from "@libsql/client";
import { drizzle as localDrizzle } from "drizzle-orm/better-sqlite3";
import { drizzle as hostedDrizzle } from "drizzle-orm/libsql";
import { migrate as migrateLocal } from "drizzle-orm/better-sqlite3/migrator";
import { migrate as migrateHosted } from "drizzle-orm/libsql/migrator";
import { atomicWrite, type WriteStatement } from "../src/db/atomic-write";
import { approvalWrites, backfillWrite, nextBusinessDay, APPROVAL_TASK_MARKER } from "../src/lib/ai-approval-followups";

const stamp = "2026-10-06T12:00:00";
const due = "2026-10-07";
const setup = [
  `INSERT INTO cities (id,name) VALUES (10,'Albuquerque'), (20,'McKinney')`,
  `INSERT INTO users (id,name,email,password_hash,role,city_id) VALUES
    (1,'Reviewer','reviewer@example.test','not-a-password','admin',10),
    (2,'Owner','owner@example.test','not-a-password','user',20),
    (3,'Research agent','agent@example.test','not-a-password','agent',10)`,
];
const stmt = (sql: string, args: WriteStatement["args"] = []): WriteStatement => ({ sql, args });

for (const driver of ["local", "libsql"] as const) {
  test(`${driver}: approvals, backfill, ownership, exclusions and rollback`, async () => {
    const client = driver === "local" ? new Database(":memory:") : createClient({ url: ":memory:" });
    try {
      const db = driver === "local" ? localDrizzle(client as Database.Database) : hostedDrizzle(client as ReturnType<typeof createClient>);
      assert.equal(db.$client, client, "runtime writer uses the Drizzle connection");
      await atomicWrite(client, [stmt("PRAGMA foreign_keys = ON")]);
      // Real committed migrations, not a simplified test-only table schema.
      if (driver === "local") migrateLocal(localDrizzle(client as Database.Database), { migrationsFolder: "drizzle" });
      else await migrateHosted(hostedDrizzle(client as ReturnType<typeof createClient>), { migrationsFolder: "drizzle" });
      await atomicWrite(client, setup.map((sql) => stmt(sql)));
      const read = async (sql: string) => "execute" in client
        ? (await client.execute(sql)).rows : client.prepare(sql).all() as Record<string, unknown>[];
      const add = async (id: number, options: { state?: string; city?: number | null; owner?: number | null; reviewer?: number | null; dnc?: number } = {}) => {
        await atomicWrite(client, [stmt(`INSERT INTO accounts
          (id, name, ai_review_status, city_id, user_id, ai_reviewed_by, do_not_contact)
          VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, `Business ${id}`, options.state ?? "Pending",
          options.city === undefined ? 10 : options.city, options.owner === undefined ? 3 : options.owner,
          options.reviewer ?? null, options.dnc ?? 0])]);
      };
      await add(1);
      assert.deepEqual(await atomicWrite(client, approvalWrites(1, 1, stamp, due)), [1, 1]);
      let tasks = await read("SELECT * FROM tasks");
      assert.equal(tasks[0].user_id, 1, "machine owner replaced by human reviewer");
      assert.equal(tasks[0].city_id, 10);
      assert.equal(tasks[0].due_date, due);
      assert.equal(tasks[0].title, "Follow up with Business 1");
      assert.equal((await read("SELECT status FROM accounts WHERE id=1"))[0].status, "New Prospect");
      await atomicWrite(client, approvalWrites(1, 1, stamp, due));
      assert.equal((await read("SELECT * FROM tasks")).length, 1, "retry creates no duplicate");
      await add(2, { owner: 2, city: 20 });
      await atomicWrite(client, approvalWrites(2, 1, stamp, due));
      assert.equal((await read("SELECT * FROM tasks WHERE account_id=2"))[0].user_id, 2);
      assert.equal((await read("SELECT * FROM tasks WHERE account_id=2"))[0].city_id, 20);
      await add(3, { dnc: 1 });
      await add(4, { city: null });
      await add(5, { state: "Rejected" });
      for (const id of [3, 4, 5]) await atomicWrite(client, approvalWrites(id, 1, stamp, due));
      assert.equal((await read("SELECT * FROM tasks WHERE account_id IN (3,4,5)")).length, 0);
      assert.equal((await read("SELECT ai_review_status FROM accounts WHERE id=5"))[0].ai_review_status, "Rejected");

      // Existing real tasks already cover the outreach, including completed work.
      for (const [id, state] of [[6, "Open"], [7, "Completed"]] as const) {
        await add(id);
        await atomicWrite(client, [stmt("INSERT INTO tasks (title,account_id,city_id,user_id,status) VALUES ('Existing',?,10,2,?)", [id, state])]);
        assert.deepEqual(await atomicWrite(client, approvalWrites(id, 1, stamp, due)), [1, 0]);
      }
      await add(8, { state: "Approved", reviewer: 1 });
      await add(9, { state: "Approved", reviewer: 2, city: 20 });
      await add(10, { state: "Approved" }); // no human assignee
      await add(11, { state: "Pending", reviewer: 1 });
      assert.deepEqual(await atomicWrite(client, [backfillWrite(10, due, stamp)]), [1]);
      assert.equal((await read("SELECT * FROM tasks WHERE account_id=9")).length, 0, "city scope honored");
      assert.deepEqual(await atomicWrite(client, [backfillWrite(null, due, stamp)]), [1]);
      assert.deepEqual(await atomicWrite(client, [backfillWrite(null, due, stamp)]), [0], "backfill idempotent");
      assert.equal((await read("SELECT * FROM tasks WHERE account_id IN (10,11)")).length, 0);
      await atomicWrite(client, [stmt("UPDATE tasks SET status='Canceled' WHERE account_id=8")]);
      assert.deepEqual(await atomicWrite(client, [backfillWrite(null, due, stamp)]), [0], "canceled approval task stays canceled");
      assert.ok(String((await read("SELECT notes FROM tasks WHERE account_id=8"))[0].notes).startsWith(APPROVAL_TASK_MARKER));

      // A database failure rolls back the verdict as well as the task.
      await add(12);
      await atomicWrite(client, [stmt(`CREATE TRIGGER fail_task BEFORE INSERT ON tasks WHEN NEW.account_id=12
        BEGIN SELECT RAISE(ABORT, 'test task failure'); END`)]);
      await assert.rejects(atomicWrite(client, approvalWrites(12, 1, stamp, due)));
      assert.equal((await read("SELECT ai_review_status FROM accounts WHERE id=12"))[0].ai_review_status, "Pending");
      assert.equal((await read("SELECT * FROM tasks WHERE account_id=12")).length, 0);
      await atomicWrite(client, [stmt("DROP TRIGGER fail_task")]);
      await add(13);
      await Promise.all([atomicWrite(client, approvalWrites(13, 1, stamp, due)), atomicWrite(client, approvalWrites(13, 1, stamp, due))]);
      tasks = await read("SELECT * FROM tasks WHERE account_id=13");
      assert.equal(tasks.length, 1, "simultaneous approval writes produce one task");
      await add(14, { state: "Approved", reviewer: 1 });
      await atomicWrite(client, [stmt("INSERT INTO tasks (title,account_id,city_id,user_id,status) VALUES ('Canceled manual',14,10,1,'Canceled')")]);
      assert.deepEqual(await atomicWrite(client, [backfillWrite(10, due, stamp)]), [1], "canceled manual task does not block follow-up");
      await add(15, { state: "Approved", reviewer: 1, dnc: 1 });
      await add(16, { state: "Approved", owner: 2, reviewer: null, city: 20 });
      assert.deepEqual(await atomicWrite(client, [backfillWrite(20, due, stamp)]), [1], "human owner is sufficient for historical approval");
      assert.equal((await read("SELECT * FROM tasks WHERE account_id=15")).length, 0, "backfill respects do-not-contact");
      await add(17, { owner: 2, city: 10 });
      await atomicWrite(client, approvalWrites(17, 1, stamp, due));
      assert.equal((await read("SELECT * FROM tasks WHERE account_id=17"))[0].user_id, 1, "moved member owner cannot receive an inaccessible task");
      await add(18, { state: "Approved", owner: 3, reviewer: 2, city: 10 });
      assert.deepEqual(await atomicWrite(client, [backfillWrite(null, due, stamp)]), [0], "out-of-city member reviewer cannot receive a task");
    } finally { client.close(); }
  });
}

test("next business day skips weekends and crosses months/years", () => {
  assert.equal(nextBusinessDay("2026-10-06"), "2026-10-07");
  assert.equal(nextBusinessDay("2026-10-09"), "2026-10-12");
  assert.equal(nextBusinessDay("2026-10-10"), "2026-10-12");
  assert.equal(nextBusinessDay("2026-10-11"), "2026-10-12");
  assert.equal(nextBusinessDay("2026-07-31"), "2026-08-03");
  assert.equal(nextBusinessDay("2026-12-31"), "2027-01-01");
});
