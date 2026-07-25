import { Card, Field, inputCls, selectCls, Btn } from "@/components/ui";
import { CONTACT_TYPES, INFLUENCE_LEVELS, PREFERRED_METHODS, RELATIONSHIP_STATUSES } from "@/lib/taxonomy";
import { db, schema as s } from "@/db";
import { cityWhere } from "@/lib/scope";
import type { schema } from "@/db";

type Contact = typeof schema.contacts.$inferSelect;

export default async function ContactForm({ action, contact, defaultAccountId }: {
  action: (fd: FormData) => Promise<void>;
  contact?: Contact;
  defaultAccountId?: number;
}) {
  const accounts = await db.query.accounts.findMany({ where: await cityWhere(s.accounts.cityId), orderBy: (a, { asc }) => [asc(a.name)] });
  const c = contact;

  return (
    <form action={action}>
      {c && <input type="hidden" name="id" value={c.id} />}
      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="First name"><input name="firstName" required defaultValue={c?.firstName} className={inputCls} /></Field>
          <Field label="Last name"><input name="lastName" defaultValue={c?.lastName} className={inputCls} /></Field>
          <Field label="Title / role"><input name="title" defaultValue={c?.title ?? ""} className={inputCls} placeholder="e.g. HR Director" /></Field>
          <Field label="Company / account">
            <select name="accountId" defaultValue={c?.accountId ?? defaultAccountId ?? ""} className={selectCls}>
              <option value="">—</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Phone"><input name="phone" defaultValue={c?.phone ?? ""} className={inputCls} /></Field>
          <Field label="Email"><input name="email" type="email" defaultValue={c?.email ?? ""} className={inputCls} /></Field>
          <Field label="Preferred contact method">
            <select name="preferredMethod" defaultValue={c?.preferredMethod ?? ""} className={selectCls}>
              <option value="">—</option>
              {PREFERRED_METHODS.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Contact type">
            <select name="contactType" defaultValue={c?.contactType ?? "Other"} className={selectCls}>
              {CONTACT_TYPES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Influence level">
            <select name="influenceLevel" defaultValue={c?.influenceLevel ?? "Medium"} className={selectCls}>
              {INFLUENCE_LEVELS.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Relationship status">
            <select name="relationshipStatus" defaultValue={c?.relationshipStatus ?? "New"} className={selectCls}>
              {RELATIONSHIP_STATUSES.map((v) => <option key={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Source"><input name="source" defaultValue={c?.source ?? ""} className={inputCls} /></Field>
          <Field label="Next follow-up date">
            <input name="nextFollowUpAt" type="date" defaultValue={c?.nextFollowUpAt?.slice(0, 10) ?? ""} className={inputCls} />
          </Field>
          <Field label="Notes" className="md:col-span-2">
            <textarea name="notes" rows={3} defaultValue={c?.notes ?? ""} className={inputCls} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end">
          <Btn type="submit">{c ? "Save changes" : "Create contact"}</Btn>
        </div>
      </Card>
    </form>
  );
}
