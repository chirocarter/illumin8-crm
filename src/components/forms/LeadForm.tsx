import { Card, Field, inputCls, selectCls, Btn } from "@/components/ui";
import { INTEREST_LEVELS, LEAD_APPT_STATUSES, LEAD_SOURCES } from "@/lib/taxonomy";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { cityWhere } from "@/lib/scope";
import type { schema } from "@/db";

type Lead = typeof schema.leads.$inferSelect;

export default async function LeadForm({ action, lead, defaults, addAnotherQS }: {
  action: (fd: FormData) => Promise<void>;
  lead?: Lead;
  defaults?: { campaignId?: number; eventId?: number; partnerId?: number; accountId?: number; source?: string };
  /** when set, shows a "save & add another" toggle that returns to the prefilled form */
  addAnotherQS?: string;
}) {
  const [accounts, campaigns, events, partners, locations] = await Promise.all([
    db.query.accounts.findMany({ where: await cityWhere(s.accounts.cityId), orderBy: (a, { asc }) => [asc(a.name)] }),
    db.query.campaigns.findMany({ where: await cityWhere(s.campaigns.cityId) }),
    db.query.events.findMany({ where: await cityWhere(s.events.cityId), orderBy: (e, { desc }) => [desc(e.startsAt)] }),
    db.select({ id: s.partners.id, name: s.accounts.name })
      .from(s.partners).innerJoin(s.accounts, eq(s.partners.accountId, s.accounts.id))
      .where(await cityWhere(s.partners.cityId)),
    db.query.locations.findMany({ where: await cityWhere(s.locations.cityId, eq(s.locations.active, true)) }),
  ]);
  const l = lead;
  const d = defaults;

  return (
    <form action={action}>
      {l && <input type="hidden" name="id" value={l.id} />}
      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="First name"><input name="firstName" required defaultValue={l?.firstName} className={inputCls} /></Field>
          <Field label="Last name"><input name="lastName" defaultValue={l?.lastName} className={inputCls} /></Field>
          <Field label="Phone"><input name="phone" defaultValue={l?.phone ?? ""} className={inputCls} /></Field>
          <Field label="Email"><input name="email" type="email" defaultValue={l?.email ?? ""} className={inputCls} /></Field>
          <Field label="Source">
            <select name="source" defaultValue={l?.source ?? d?.source ?? "Event"} className={selectCls}>
              {LEAD_SOURCES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Interest level">
            <select name="interestLevel" defaultValue={l?.interestLevel ?? "Warm"} className={selectCls}>
              {INTEREST_LEVELS.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Source campaign">
            <select name="campaignId" defaultValue={l?.campaignId ?? d?.campaignId ?? ""} className={selectCls}>
              <option value="">—</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Source event">
            <select name="eventId" defaultValue={l?.eventId ?? d?.eventId ?? ""} className={selectCls}>
              <option value="">—</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Source partner">
            <select name="partnerId" defaultValue={l?.partnerId ?? d?.partnerId ?? ""} className={selectCls}>
              <option value="">—</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Associated business">
            <select name="accountId" defaultValue={l?.accountId ?? d?.accountId ?? ""} className={selectCls}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Appointment status">
            <select name="apptStatus" defaultValue={l?.apptStatus ?? "Not Contacted"} className={selectCls}>
              {LEAD_APPT_STATUSES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Preferred Illumin8 location">
            <select name="preferredLocationId" defaultValue={l?.preferredLocationId ?? ""} className={selectCls}>
              <option value="">—</option>
              {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
            </select>
          </Field>
          <Field label="Notes" className="md:col-span-2">
            <textarea name="notes" rows={2} defaultValue={l?.notes ?? ""} className={inputCls}
              placeholder="Outreach notes only — no health information" />
          </Field>
        </div>
        <div className="mt-5 flex items-center justify-end gap-3">
          {addAnotherQS !== undefined && (
            <label className="flex items-center gap-2 text-sm text-soft">
              <input type="checkbox" name="addAnother" value={addAnotherQS} className="h-4 w-4 accent-[#d97706]" />
              Save & add another
            </label>
          )}
          <Btn type="submit">{l ? "Save changes" : "Add lead"}</Btn>
        </div>
      </Card>
    </form>
  );
}
