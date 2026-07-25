import { Card, Field, inputCls, selectCls, Btn } from "@/components/ui";
import { ACCOUNT_STATUSES, AREAS, RELATIONSHIP_STRENGTHS, VERTICALS } from "@/lib/taxonomy";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { cityWhere } from "@/lib/scope";
import type { schema } from "@/db";

type Account = typeof schema.accounts.$inferSelect;

export default async function AccountForm({ action, account }: {
  action: (fd: FormData) => Promise<void>;
  account?: Account;
}) {
  const locations = await db.query.locations.findMany({ where: await cityWhere(s.locations.cityId, eq(s.locations.active, true)) });
  const a = account;

  return (
    <form action={action}>
      {a && <input type="hidden" name="id" value={a.id} />}
      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Business name" className="md:col-span-2">
            <input name="name" required defaultValue={a?.name} className={inputCls} placeholder="e.g. CrossFit ABQ" />
          </Field>
          <Field label="Vertical">
            <select name="vertical" defaultValue={a?.vertical ?? "Other"} className={selectCls}>
              {VERTICALS.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Area">
            <select name="area" defaultValue={a?.area ?? "Other"} className={selectCls}>
              {AREAS.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={a?.status ?? "New Prospect"} className={selectCls}>
              {ACCOUNT_STATUSES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Assigned Illumin8 location">
            <select name="clinicLocationId" defaultValue={a?.clinicLocationId ?? ""} className={selectCls}>
              <option value="">—</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Field>
          <Field label="Address" className="md:col-span-2">
            <input name="address" defaultValue={a?.address ?? ""} className={inputCls} />
          </Field>
          <Field label="Phone"><input name="phone" defaultValue={a?.phone ?? ""} className={inputCls} /></Field>
          <Field label="Email"><input name="email" type="email" defaultValue={a?.email ?? ""} className={inputCls} /></Field>
          <Field label="Website"><input name="website" defaultValue={a?.website ?? ""} className={inputCls} placeholder="https://" /></Field>
          <Field label="Source"><input name="source" defaultValue={a?.source ?? ""} className={inputCls} placeholder="How did we find them?" /></Field>
          <Field label="Owner / main contact person"><input name="ownerName" defaultValue={a?.ownerName ?? ""} className={inputCls} /></Field>
          <Field label="Next follow-up date">
            <input name="nextFollowUpAt" type="date" defaultValue={a?.nextFollowUpAt?.slice(0, 10) ?? ""} className={inputCls} />
          </Field>
          <Field label="Partnership potential (1–5)">
            <select name="partnershipScore" defaultValue={a?.partnershipScore ?? 3} className={selectCls}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Event potential (1–5)">
            <select name="eventScore" defaultValue={a?.eventScore ?? 3} className={selectCls}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Relationship strength">
            <select name="relationshipStrength" defaultValue={a?.relationshipStrength ?? "Cold"} className={selectCls}>
              {RELATIONSHIP_STRENGTHS.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Do not contact">
            <label className="flex h-[38px] items-center gap-2 text-sm text-soft">
              <input type="checkbox" name="doNotContact" defaultChecked={a?.doNotContact} className="h-4 w-4 accent-[#d97706]" />
              Exclude from outreach
            </label>
          </Field>
          <Field label="Notes" className="md:col-span-2">
            <textarea name="notes" rows={3} defaultValue={a?.notes ?? ""} className={inputCls} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Btn type="submit">{a ? "Save changes" : "Create account"}</Btn>
        </div>
      </Card>
    </form>
  );
}
