import { Card, Field, inputCls, selectCls, Btn } from "@/components/ui";
import { CAMPAIGN_STATUSES, CAMPAIGN_TYPES, PUBLIC_FORM_TYPES, normalizePublicForm } from "@/lib/taxonomy";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { cityWhere } from "@/lib/scope";
import type { schema } from "@/db";

type Campaign = typeof schema.campaigns.$inferSelect;

export default async function CampaignForm({ action, campaign, defaults }: {
  action: (fd: FormData) => Promise<void>;
  campaign?: Campaign;
  defaults?: { partnerId?: number; accountId?: number };
}) {
  const [accounts, partners] = await Promise.all([
    db.query.accounts.findMany({ where: await cityWhere(s.accounts.cityId), orderBy: (a, { asc }) => [asc(a.name)] }),
    db.select({ id: s.partners.id, name: s.accounts.name })
      .from(s.partners).innerJoin(s.accounts, eq(s.partners.accountId, s.accounts.id))
      .where(await cityWhere(s.partners.cityId)),
  ]);
  const c = campaign;

  return (
    <form action={action}>
      {c && <input type="hidden" name="id" value={c.id} />}
      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Campaign name" className="md:col-span-2">
            <input name="name" required defaultValue={c?.name} className={inputCls} placeholder="e.g. Mario's Drop Box — Summer 2026" />
          </Field>
          <Field label="Type">
            <select name="type" defaultValue={c?.type ?? "Restaurant Drop Box"} className={selectCls}>
              {CAMPAIGN_TYPES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={c?.status ?? "Active"} className={selectCls}>
              {CAMPAIGN_STATUSES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Partner">
            <select name="partnerId" defaultValue={c?.partnerId ?? defaults?.partnerId ?? ""} className={selectCls}>
              <option value="">—</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Account / business">
            <select name="accountId" defaultValue={c?.accountId ?? defaults?.accountId ?? ""} className={selectCls}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Start date">
            <input name="startDate" type="date" defaultValue={c?.startDate?.slice(0, 10) ?? ""} className={inputCls} />
          </Field>
          <Field label="End date">
            <input name="endDate" type="date" defaultValue={c?.endDate?.slice(0, 10) ?? ""} className={inputCls} />
          </Field>
          <Field label="QR sign-up form" className="md:col-span-2"
            hint="What the scannable form collects. Patient → a lead. Partnership & Lunch & learn → the business, a contact, and a lead.">
            <select name="publicForm" defaultValue={normalizePublicForm(c?.publicForm)} className={selectCls}>
              {PUBLIC_FORM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="QR code / tracking link" className="md:col-span-2">
            <input name="trackingUrl" defaultValue={c?.trackingUrl ?? ""} className={inputCls} placeholder="https://illumin8chiro.com/win-lunch" />
          </Field>
          <Field label="Offer" className="md:col-span-2">
            <input name="offer" defaultValue={c?.offer ?? ""} className={inputCls} placeholder="What people get" />
          </Field>
          <Field label="Notes" className="md:col-span-2">
            <textarea name="notes" rows={3} defaultValue={c?.notes ?? ""} className={inputCls} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end">
          <Btn type="submit">{c ? "Save changes" : "Create campaign"}</Btn>
        </div>
      </Card>
    </form>
  );
}
