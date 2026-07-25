import { Card, Field, inputCls, selectCls, Btn } from "@/components/ui";
import { OPPORTUNITY_TYPES } from "@/lib/taxonomy";
import StageLossFields from "./StageLossFields";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { cityWhere } from "@/lib/scope";
import type { schema } from "@/db";

type Opportunity = typeof schema.opportunities.$inferSelect;

export default async function OpportunityForm({ action, opportunity, defaultAccountId }: {
  action: (fd: FormData) => Promise<void>;
  opportunity?: Opportunity;
  defaultAccountId?: number;
}) {
  const [accounts, contacts, campaigns, locations] = await Promise.all([
    db.query.accounts.findMany({ where: await cityWhere(s.accounts.cityId), orderBy: (a, { asc }) => [asc(a.name)] }),
    db.query.contacts.findMany({ where: await cityWhere(s.contacts.cityId), orderBy: (c, { asc }) => [asc(c.firstName)] }),
    db.query.campaigns.findMany({ where: await cityWhere(s.campaigns.cityId) }),
    db.query.locations.findMany({ where: await cityWhere(s.locations.cityId, eq(s.locations.active, true)) }),
  ]);
  const o = opportunity;

  return (
    <form action={action}>
      {o && <input type="hidden" name="id" value={o.id} />}
      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Opportunity name" className="md:col-span-2">
            <input name="name" required defaultValue={o?.name} className={inputCls} placeholder="e.g. RGCU Lunch & Learn" />
          </Field>
          <Field label="Type">
            <select name="type" defaultValue={o?.type ?? "Lunch and Learn"} className={selectCls}>
              {OPPORTUNITY_TYPES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <StageLossFields defaultStage={o?.stage ?? "Prospect Identified"} defaultLossReason={o?.lossReason ?? ""} />
          <Field label="Account">
            <select name="accountId" defaultValue={o?.accountId ?? defaultAccountId ?? ""} className={selectCls}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Primary contact">
            <select name="contactId" defaultValue={o?.contactId ?? ""} className={selectCls}>
              <option value="">—</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
          </Field>
          <Field label="Expected event date">
            <input name="expectedEventDate" type="date" defaultValue={o?.expectedEventDate?.slice(0, 10) ?? ""} className={inputCls} />
          </Field>
          <Field label="Next follow-up date">
            <input name="nextFollowUpAt" type="date" defaultValue={o?.nextFollowUpAt?.slice(0, 10) ?? ""} className={inputCls} />
          </Field>
          <Field label="Next step" className="md:col-span-2">
            <input name="nextStep" defaultValue={o?.nextStep ?? ""} className={inputCls} placeholder="The single next action to move this forward" />
          </Field>
          <Field label="Source campaign">
            <select name="campaignId" defaultValue={o?.campaignId ?? ""} className={selectCls}>
              <option value="">—</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Illumin8 location">
            <select name="clinicLocationId" defaultValue={o?.clinicLocationId ?? ""} className={selectCls}>
              <option value="">—</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Notes" className="md:col-span-2">
            <textarea name="notes" rows={3} defaultValue={o?.notes ?? ""} className={inputCls} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end">
          <Btn type="submit">{o ? "Save changes" : "Create opportunity"}</Btn>
        </div>
      </Card>
    </form>
  );
}
