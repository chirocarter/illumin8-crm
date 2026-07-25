import { Card, Field, inputCls, selectCls, Btn } from "@/components/ui";
import { EVENT_STATUSES, EVENT_TYPES } from "@/lib/taxonomy";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { cityWhere } from "@/lib/scope";
import type { schema } from "@/db";

type Event = typeof schema.events.$inferSelect;

export default async function EventForm({ action, event, defaults }: {
  action: (fd: FormData) => Promise<void>;
  event?: Event;
  defaults?: { accountId?: number; contactId?: number; opportunityId?: number; partnerId?: number; campaignId?: number };
}) {
  const [accounts, contacts, opportunities, campaigns, partners, locations] = await Promise.all([
    db.query.accounts.findMany({ where: await cityWhere(s.accounts.cityId), orderBy: (a, { asc }) => [asc(a.name)] }),
    db.query.contacts.findMany({ where: await cityWhere(s.contacts.cityId), orderBy: (c, { asc }) => [asc(c.firstName)] }),
    db.query.opportunities.findMany({ where: await cityWhere(s.opportunities.cityId), orderBy: (o, { desc }) => [desc(o.createdAt)] }),
    db.query.campaigns.findMany({ where: await cityWhere(s.campaigns.cityId) }),
    db.select({ id: s.partners.id, name: s.accounts.name })
      .from(s.partners).innerJoin(s.accounts, eq(s.partners.accountId, s.accounts.id))
      .where(await cityWhere(s.partners.cityId)),
    db.query.locations.findMany({ where: await cityWhere(s.locations.cityId, eq(s.locations.active, true)) }),
  ]);
  const e = event;
  const d = defaults;

  return (
    <form action={action}>
      {e && <input type="hidden" name="id" value={e.id} />}
      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Event name" className="md:col-span-2">
            <input name="name" required defaultValue={e?.name} className={inputCls} placeholder="e.g. CrossFit ABQ Screening Day" />
          </Field>
          <Field label="Type">
            <select name="type" defaultValue={e?.type ?? "Lunch and Learn"} className={selectCls}>
              {EVENT_TYPES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={e?.status ?? "Planning"} className={selectCls}>
              {EVENT_STATUSES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Date & time">
            <input name="startsAt" type="datetime-local" defaultValue={e?.startsAt?.slice(0, 16) ?? ""} className={inputCls} />
          </Field>
          <Field label="Where (venue / address)">
            <input name="locationText" defaultValue={e?.locationText ?? ""} className={inputCls} />
          </Field>
          <Field label="Host account">
            <select name="accountId" defaultValue={e?.accountId ?? d?.accountId ?? ""} className={selectCls}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Primary contact">
            <select name="contactId" defaultValue={e?.contactId ?? d?.contactId ?? ""} className={selectCls}>
              <option value="">—</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
          </Field>
          <Field label="Related opportunity">
            <select name="opportunityId" defaultValue={e?.opportunityId ?? d?.opportunityId ?? ""} className={selectCls}>
              <option value="">—</option>
              {opportunities.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Campaign">
            <select name="campaignId" defaultValue={e?.campaignId ?? d?.campaignId ?? ""} className={selectCls}>
              <option value="">—</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Partner">
            <select name="partnerId" defaultValue={e?.partnerId ?? d?.partnerId ?? ""} className={selectCls}>
              <option value="">—</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Illumin8 location">
            <select name="clinicLocationId" defaultValue={e?.clinicLocationId ?? ""} className={selectCls}>
              <option value="">—</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Expected attendees">
            <input name="expectedAttendees" type="number" min="0" defaultValue={e?.expectedAttendees ?? 0} className={inputCls} />
          </Field>
          {/* Due date only appears once follow-up is checked (peer CSS, no JS) */}
          <Field label="Follow-up required" className="md:col-span-2">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex h-[38px] items-center gap-2 text-sm text-soft">
                <input type="checkbox" name="followUpRequired" defaultChecked={e?.followUpRequired} className="peer h-4 w-4 accent-[#d97706]" />
                Needs post-event follow-up
                <span className="hidden items-center gap-2 pl-2 peer-checked:flex">
                  <span className="text-[0.8rem] font-medium">due</span>
                  <input name="followUpDueAt" type="date" defaultValue={e?.followUpDueAt?.slice(0, 10) ?? ""} className={inputCls + " !w-auto"} />
                </span>
              </label>
            </div>
          </Field>
          <Field label="Notes" className="md:col-span-2">
            <textarea name="notes" rows={3} defaultValue={e?.notes ?? ""} className={inputCls} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end">
          <Btn type="submit">{e ? "Save changes" : "Create event"}</Btn>
        </div>
      </Card>
    </form>
  );
}
