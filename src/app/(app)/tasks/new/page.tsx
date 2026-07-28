import { PageHeader, Card, Field, inputCls, selectCls, Btn } from "@/components/ui";
import { createTask } from "@/app/actions";
import { db, schema as s } from "@/db";
import { cityWhere } from "@/lib/scope";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";
import { todayISO } from "@/lib/dates";

export const metadata = { title: "New Task" };
export const dynamic = "force-dynamic";

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [accounts, contacts] = await Promise.all([
    db.query.accounts.findMany({ where: await cityWhere(s.accounts.cityId), orderBy: (a, { asc }) => [asc(a.name)] }),
    db.query.contacts.findMany({ where: await cityWhere(s.contacts.cityId), orderBy: (c, { asc }) => [asc(c.firstName)] }),
  ]);
  const pre = (k: string) => spStr(sp, k) ?? "";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="New Task" />
      <form action={createTask}>
        <input type="hidden" name="opportunityId" value={pre("opportunityId")} />
        <input type="hidden" name="eventId" value={pre("eventId")} />
        <input type="hidden" name="projectId" value={pre("projectId")} />
        <Card className="p-6">
          <div className="grid gap-4">
            <Field label="What needs to happen?">
              <input name="title" required className={inputCls} placeholder="e.g. Call Dr. Chan to confirm the talk" />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Due date">
                {/* ?dueDate= is set when adding from a specific calendar day */}
                <input name="dueDate" type="date" defaultValue={pre("dueDate") || todayISO()} className={inputCls} />
              </Field>
              <Field label="Business">
                <select name="accountId" defaultValue={pre("accountId")} className={selectCls}>
                  <option value="">—</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </Field>
              <Field label="Contact" className="md:col-span-2">
                <select name="contactId" defaultValue={pre("contactId")} className={selectCls}>
                  <option value="">—</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Notes">
              <textarea name="notes" rows={2} className={inputCls} />
            </Field>
          </div>
          <div className="mt-5 flex justify-end">
            <Btn type="submit">Create task</Btn>
          </div>
        </Card>
      </form>
    </div>
  );
}
