import { Card, Field, inputCls, selectCls, Btn } from "@/components/ui";
import { DROP_BOX_STATUSES, PARTNER_STATUSES, PARTNER_TYPES } from "@/lib/taxonomy";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { cityWhere } from "@/lib/scope";
import type { schema } from "@/db";

type Partner = typeof schema.partners.$inferSelect;

export default async function PartnerForm({ action, partner, defaultAccountId }: {
  action: (fd: FormData) => Promise<void>;
  partner?: Partner;
  defaultAccountId?: number;
}) {
  const [accounts, contacts, locations] = await Promise.all([
    db.query.accounts.findMany({ where: await cityWhere(s.accounts.cityId), orderBy: (a, { asc }) => [asc(a.name)] }),
    db.query.contacts.findMany({ where: await cityWhere(s.contacts.cityId), orderBy: (c, { asc }) => [asc(c.firstName)] }),
    db.query.locations.findMany({ where: await cityWhere(s.locations.cityId, eq(s.locations.active, true)) }),
  ]);
  const p = partner;

  return (
    <form action={action}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Partner business">
            <select name="accountId" required defaultValue={p?.accountId ?? defaultAccountId ?? ""} className={selectCls}>
              <option value="">Select business…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Partner type">
            <select name="partnerType" defaultValue={p?.partnerType ?? "Business Partner"} className={selectCls}>
              {PARTNER_TYPES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={p?.status ?? "Prospective"} className={selectCls}>
              {PARTNER_STATUSES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Start date">
            <input name="startDate" type="date" defaultValue={p?.startDate?.slice(0, 10) ?? ""} className={inputCls} />
          </Field>
          <Field label="Main contact">
            <select name="mainContactId" defaultValue={p?.mainContactId ?? ""} className={selectCls}>
              <option value="">—</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
          </Field>
          <Field label="Illumin8 location">
            <select name="clinicLocationId" defaultValue={p?.clinicLocationId ?? ""} className={selectCls}>
              <option value="">—</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Benefits offered" className="md:col-span-2">
            <input name="benefits" defaultValue={p?.benefits ?? ""} className={inputCls} placeholder="What each side gets from the partnership" />
          </Field>
        </div>

        <div className="mt-5 rounded-xl bg-canvas p-4">
          <p className="mb-3 text-sm font-medium">Restaurant / drop box details</p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Drop box active">
              <label className="flex h-[38px] items-center gap-2 text-sm text-soft">
                <input type="checkbox" name="dropBoxActive" defaultChecked={p?.dropBoxActive} className="h-4 w-4 accent-[#d97706]" />
                This partner hosts a drop box
              </label>
            </Field>
            <Field label="Drop box status">
              <select name="dropBoxStatus" defaultValue={p?.dropBoxStatus ?? ""} className={selectCls}>
                <option value="">—</option>
                {DROP_BOX_STATUSES.map((v) => <option key={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Last pickup">
              <input name="lastPickupAt" type="date" defaultValue={p?.lastPickupAt?.slice(0, 10) ?? ""} className={inputCls} />
            </Field>
            <Field label="Next pickup due">
              <input name="nextPickupDueAt" type="date" defaultValue={p?.nextPickupDueAt?.slice(0, 10) ?? ""} className={inputCls} />
            </Field>
            <Field label="Lunch offer details">
              <input name="lunchOffer" defaultValue={p?.lunchOffer ?? ""} className={inputCls} placeholder="e.g. Team pizza lunch for 15 (~$120)" />
            </Field>
            <Field label="Catering / ordering info">
              <input name="cateringInfo" defaultValue={p?.cateringInfo ?? ""} className={inputCls} />
            </Field>
            <Field label="Cards collected (total)">
              <input name="cardsCollected" type="number" min="0" defaultValue={p?.cardsCollected ?? 0} className={inputCls} />
            </Field>
            <Field label="Revenue spent at partner ($)">
              <input name="revenueSpent" type="number" min="0" step="10" defaultValue={p?.revenueSpent ?? 0} className={inputCls} />
            </Field>
          </div>
        </div>

        <Field label="Notes" className="mt-4">
          <textarea name="notes" rows={3} defaultValue={p?.notes ?? ""} className={inputCls} />
        </Field>
        <div className="mt-5 flex justify-end">
          <Btn type="submit">{p ? "Save changes" : "Create partner"}</Btn>
        </div>
      </Card>
    </form>
  );
}
