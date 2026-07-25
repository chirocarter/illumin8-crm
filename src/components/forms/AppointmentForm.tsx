import { Card, Field, inputCls, selectCls, Btn } from "@/components/ui";
import { APPOINTMENT_STATUSES, LEAD_SOURCES } from "@/lib/taxonomy";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { cityWhere } from "@/lib/scope";
import type { schema } from "@/db";

type Appointment = typeof schema.appointments.$inferSelect;

export default async function AppointmentForm({ action, appointment, defaults }: {
  action: (fd: FormData) => Promise<void>;
  appointment?: Appointment;
  defaults?: Partial<Record<"leadId" | "eventId" | "campaignId" | "partnerId" | "accountId" | "locationId", number>> & { source?: string };
}) {
  // Every picker offers only the city you're working in.
  const [leads, contacts, accounts, campaigns, events, partners, locations] = await Promise.all([
    db.query.leads.findMany({ where: await cityWhere(s.leads.cityId), orderBy: (l, { desc }) => [desc(l.createdAt)] }),
    db.query.contacts.findMany({ where: await cityWhere(s.contacts.cityId), orderBy: (c, { asc }) => [asc(c.firstName)] }),
    db.query.accounts.findMany({ where: await cityWhere(s.accounts.cityId), orderBy: (a, { asc }) => [asc(a.name)] }),
    db.query.campaigns.findMany({ where: await cityWhere(s.campaigns.cityId) }),
    db.query.events.findMany({ where: await cityWhere(s.events.cityId), orderBy: (e, { desc }) => [desc(e.startsAt)] }),
    db.select({ id: s.partners.id, name: s.accounts.name })
      .from(s.partners).innerJoin(s.accounts, eq(s.partners.accountId, s.accounts.id))
      .where(await cityWhere(s.partners.cityId)),
    db.query.locations.findMany({ where: await cityWhere(s.locations.cityId, eq(s.locations.active, true)) }),
  ]);
  const a = appointment;
  const d = defaults;
  const defaultLead = a?.leadId ?? d?.leadId;
  const leadName = defaultLead ? leads.find((l) => l.id === defaultLead) : null;

  return (
    <form action={action}>
      {a && <input type="hidden" name="id" value={a.id} />}
      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Lead">
            <select name="leadId" defaultValue={defaultLead ?? ""} className={selectCls}>
              <option value="">—</option>
              {leads.map((l) => <option key={l.id} value={l.id}>{l.firstName} {l.lastName}</option>)}
            </select>
          </Field>
          <Field label="Or existing contact">
            <select name="contactId" defaultValue={a?.contactId ?? ""} className={selectCls}>
              <option value="">—</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
          </Field>
          <Field label="Person name (as displayed)" className="md:col-span-2" hint="Auto-filled from the lead if left blank">
            <input name="personName" defaultValue={a?.personName ?? (leadName ? `${leadName.firstName} ${leadName.lastName}` : "")} className={inputCls} />
          </Field>
          <Field label="Appointment date & time">
            <input name="scheduledAt" type="datetime-local" defaultValue={a?.scheduledAt?.slice(0, 16) ?? ""} className={inputCls} />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={a?.status ?? "Booked"} className={selectCls}>
              {APPOINTMENT_STATUSES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Illumin8 location">
            <select name="locationId" defaultValue={a?.locationId ?? d?.locationId ?? ""} className={selectCls}>
              <option value="">—</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Source">
            <select name="source" defaultValue={a?.source ?? d?.source ?? "Event"} className={selectCls}>
              {LEAD_SOURCES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Source event">
            <select name="eventId" defaultValue={a?.eventId ?? d?.eventId ?? ""} className={selectCls}>
              <option value="">—</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Source campaign">
            <select name="campaignId" defaultValue={a?.campaignId ?? d?.campaignId ?? ""} className={selectCls}>
              <option value="">—</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Source partner">
            <select name="partnerId" defaultValue={a?.partnerId ?? d?.partnerId ?? ""} className={selectCls}>
              <option value="">—</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Source business">
            <select name="accountId" defaultValue={a?.accountId ?? d?.accountId ?? ""} className={selectCls}>
              <option value="">—</option>
              {accounts.map((acc) => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
            </select>
          </Field>
          <Field label="Offer used">
            <input name="offer" defaultValue={a?.offer ?? ""} className={inputCls} placeholder="e.g. $49 new-patient exam" />
          </Field>
          <Field label="Money charged ($)">
            <input name="revenue" type="number" min="0" step="1" defaultValue={a?.revenue ?? 0} className={inputCls} />
          </Field>
          <Field label="Already collected?">
            <label className="flex h-[38px] items-center gap-2 text-sm text-soft">
              <input type="checkbox" name="collected" defaultChecked={a?.collected} className="h-4 w-4 accent-[#d97706]" />
              Payment has been collected
            </label>
          </Field>
          <Field label="Notes" className="md:col-span-2">
            <textarea name="notes" rows={2} defaultValue={a?.notes ?? ""} className={inputCls} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end">
          <Btn type="submit">{a ? "Save changes" : "Add appointment"}</Btn>
        </div>
      </Card>
    </form>
  );
}
