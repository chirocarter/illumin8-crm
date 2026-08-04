// Marketing spend: hours worked (priced at each person's rate) plus money out
// the door. Both feed the Marketing Spend figure on the dashboard and report.
import Link from "next/link";
import { db, schema as s } from "@/db";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { PageHeader, Card, CardHeader, Field, Btn, inputCls, selectCls, RecordLink, EmptyState } from "@/components/ui";
import { logHours, logExpense, deleteTimeEntry, deleteExpense } from "@/app/actions";
import { requireUser } from "@/lib/auth";
import { activeCity, listScope } from "@/lib/scope";
import { rangeFromSP, fmtDate, fmtMoney, todayISO } from "@/lib/dates";
import { EXPENSE_CATEGORIES } from "@/lib/taxonomy";
import RangeNav from "@/components/RangeNav";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const metadata = { title: "Marketing Spend" };
export const dynamic = "force-dynamic";

export default async function SpendPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { from, to } = rangeFromSP(sp);
  const [user, city, scope] = await Promise.all([requireUser(), activeCity(), listScope(sp)]);
  const inRange = (col: SQLiteColumn) => and(gte(col, from), lt(col, to + "T99"));

  const [hours, spends, accounts, contacts, leads] = await Promise.all([
    db.select({
      id: s.timeEntries.id, workedOn: s.timeEntries.workedOn, hours: s.timeEntries.hours,
      notes: s.timeEntries.notes, userId: s.timeEntries.userId,
      who: s.users.name, rate: s.users.hourlyRate,
    }).from(s.timeEntries).leftJoin(s.users, eq(s.timeEntries.userId, s.users.id))
      .where(and(inRange(s.timeEntries.workedOn), ...(scope.cityId ? [eq(s.timeEntries.cityId, scope.cityId)] : [])))
      .orderBy(desc(s.timeEntries.workedOn)),

    db.select({
      id: s.expenses.id, spentOn: s.expenses.spentOn, amount: s.expenses.amount,
      notes: s.expenses.notes, category: s.expenses.category,
      accountId: s.expenses.accountId, accountName: s.accounts.name,
      contactId: s.expenses.contactId, leadId: s.expenses.leadId,
    }).from(s.expenses).leftJoin(s.accounts, eq(s.expenses.accountId, s.accounts.id))
      .where(and(inRange(s.expenses.spentOn), ...(scope.cityId ? [eq(s.expenses.cityId, scope.cityId)] : [])))
      .orderBy(desc(s.expenses.spentOn)),

    db.query.accounts.findMany({
      where: scope.cityId ? eq(s.accounts.cityId, scope.cityId) : undefined,
      orderBy: (a, { asc }) => [asc(a.name)], columns: { id: true, name: true },
    }),
    db.query.contacts.findMany({
      where: scope.cityId ? eq(s.contacts.cityId, scope.cityId) : undefined,
      orderBy: (c, { asc }) => [asc(c.firstName)], columns: { id: true, firstName: true, lastName: true },
    }),
    db.query.leads.findMany({
      where: scope.cityId ? eq(s.leads.cityId, scope.cityId) : undefined,
      orderBy: (l, { desc }) => [desc(l.createdAt)], limit: 300,
      columns: { id: true, firstName: true, lastName: true },
    }),
  ]);

  const totalHours = hours.reduce((n, h) => n + h.hours, 0);
  const labour = hours.reduce((n, h) => n + h.hours * (h.rate ?? 0), 0);
  const direct = spends.reduce((n, e) => n + e.amount, 0);

  const saved = spStr(sp, "saved");
  const error = spStr(sp, "error");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Marketing Spend"
        subtitle={`${city?.name ?? "This city"} · hours priced at each person's rate, plus money spent`} />
      <RangeNav basePath="/spend" from={from} to={to} />

      {saved === "hours" && <p className="mb-4 rounded-xl bg-good-soft px-4 py-2.5 text-sm font-medium text-good">Hours logged.</p>}
      {saved === "expense" && <p className="mb-4 rounded-xl bg-good-soft px-4 py-2.5 text-sm font-medium text-good">Spend logged.</p>}
      {error && <p className="mb-4 rounded-xl bg-bad-soft px-4 py-2.5 text-sm font-medium text-bad">
        Enter a {error === "hours" ? "number of hours" : "dollar amount"} greater than zero.</p>}

      {/* Totals */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Hours Worked", value: totalHours.toFixed(1) },
          { label: "Cost of Hours", value: fmtMoney(labour), accent: true },
          { label: "Direct Spend", value: fmtMoney(direct), accent: true },
          { label: "Marketing Spend", value: fmtMoney(labour + direct), accent: true },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <p className="text-[0.72rem] font-medium uppercase tracking-wider text-faint">{c.label}</p>
            <p className={`mt-1.5 text-2xl font-semibold leading-none ${c.accent ? "text-accent-deep" : ""}`}>{c.value}</p>
          </Card>
        ))}
      </div>

      {user.hourlyRate === 0 && (
        <p className="mb-5 rounded-xl bg-warn-soft px-4 py-2.5 text-sm text-accent-deep">
          Your hourly rate is $0, so logged hours cost nothing yet. An admin can set it in{" "}
          <Link href="/settings" className="font-medium underline">Settings → Team</Link>.
        </p>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {/* Hours */}
        <Card>
          <CardHeader title="Hours" action={
            <span className="text-xs text-faint">{totalHours.toFixed(1)} h · {fmtMoney(labour)}</span>} />
          <form action={logHours} className="grid gap-3 border-b border-hairline px-5 pb-4 md:grid-cols-2">
            <Field label="Date"><input name="workedOn" type="date" defaultValue={todayISO()} className={inputCls} /></Field>
            <Field label="Hours"><input name="hours" type="number" step="0.25" min="0" required placeholder="e.g. 6.5" className={inputCls} /></Field>
            <Field label="What you worked on (optional)" className="md:col-span-2">
              <input name="notes" className={inputCls} placeholder="Drop box route, gym screenings…" />
            </Field>
            <div className="flex justify-end md:col-span-2"><Btn type="submit">Log hours</Btn></div>
          </form>
          {hours.length === 0 ? (
            <p className="px-5 py-4 text-sm text-faint">No hours logged in this range.</p>
          ) : (
            <ul className="divide-y divide-hairline px-5 pb-2">
              {hours.map((h) => (
                <li key={h.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{h.hours} h · {fmtMoney(h.hours * (h.rate ?? 0))}</span>
                    <span className="block truncate text-xs text-soft">
                      {fmtDate(h.workedOn)}{h.who ? ` · ${h.who}` : ""}{h.notes ? ` · ${h.notes}` : ""}
                    </span>
                  </span>
                  <form action={deleteTimeEntry}>
                    <input type="hidden" name="id" value={h.id} />
                    <button type="submit" title="Remove"
                      className="rounded-full px-2 py-1 text-sm text-faint transition-colors hover:bg-bad-soft hover:text-bad">×</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Direct spend */}
        <Card>
          <CardHeader title="Spend" action={<span className="text-xs text-faint">{fmtMoney(direct)}</span>} />
          <form action={logExpense} className="grid gap-3 border-b border-hairline px-5 pb-4 md:grid-cols-2">
            <Field label="Date"><input name="spentOn" type="date" defaultValue={todayISO()} className={inputCls} /></Field>
            <Field label="Amount"><input name="amount" type="number" step="0.01" min="0" required placeholder="e.g. 85.00" className={inputCls} /></Field>
            <Field label="Category">
              <select name="category" className={selectCls}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
            </Field>
            <Field label="For (optional)">
              <select name="accountId" defaultValue="" className={selectCls}>
                <option value="">— business —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Contact (optional)">
              <select name="contactId" defaultValue="" className={selectCls}>
                <option value="">—</option>
                {contacts.map((c) => <option key={c.id} value={c.id}>{`${c.firstName} ${c.lastName}`.trim()}</option>)}
              </select>
            </Field>
            <Field label="Lead (optional)">
              <select name="leadId" defaultValue="" className={selectCls}>
                <option value="">—</option>
                {leads.map((l) => <option key={l.id} value={l.id}>{`${l.firstName} ${l.lastName}`.trim()}</option>)}
              </select>
            </Field>
            <Field label="What it was for" className="md:col-span-2">
              <input name="notes" className={inputCls} placeholder="Catering for lunch & learn, flyer printing…" />
            </Field>
            <div className="flex justify-end md:col-span-2"><Btn type="submit">Log spend</Btn></div>
          </form>
          {spends.length === 0 ? (
            <p className="px-5 py-4 text-sm text-faint">Nothing logged in this range.</p>
          ) : (
            <ul className="divide-y divide-hairline px-5 pb-2">
              {spends.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{fmtMoney(e.amount)} · {e.category}</span>
                    <span className="block truncate text-xs text-soft">
                      {fmtDate(e.spentOn)}
                      {e.accountId && <> · <RecordLink href={`/accounts/${e.accountId}`} muted>{e.accountName}</RecordLink></>}
                      {e.notes ? ` · ${e.notes}` : ""}
                    </span>
                  </span>
                  <form action={deleteExpense}>
                    <input type="hidden" name="id" value={e.id} />
                    <button type="submit" title="Remove"
                      className="rounded-full px-2 py-1 text-sm text-faint transition-colors hover:bg-bad-soft hover:text-bad">×</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
