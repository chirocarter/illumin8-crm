import { Card, Field, inputCls, selectCls, Btn } from "@/components/ui";
import { CAMPAIGN_STATUSES, CAMPAIGN_TYPES, NON_OUTREACH_EVENT_TYPES, normalizePublicForm } from "@/lib/taxonomy";
import { db, schema as s } from "@/db";
import { and, asc, gte, inArray, isNull, notInArray, or, eq } from "drizzle-orm";
import { cityWhere } from "@/lib/scope";
import { humanCountableEvents } from "@/lib/ai-review";
import { fmtDate, todayISO } from "@/lib/dates";
import PublicFormSettings from "./PublicFormSettings";
import type { schema } from "@/db";

type Campaign = typeof schema.campaigns.$inferSelect;

export default async function CampaignForm({ action, campaign, defaults, screeningError }: {
  action: (fd: FormData) => Promise<void>;
  campaign?: Campaign;
  /** publicForm: reopen on this form type (after the server sent settings back). */
  defaults?: { accountId?: number; publicForm?: string };
  /** Why the screening window settings were sent back, if they were. */
  screeningError?: string;
}) {
  const c = campaign;
  const [accounts, events] = await Promise.all([
    db.query.accounts.findMany({ where: await cityWhere(s.accounts.cityId), orderBy: (a, { asc }) => [asc(a.name)] }),
    // Events a screening form can be for: this city's outreach events that are
    // still ahead (or undated), real rather than an unreviewed AI suggestion,
    // and not called off — plus whatever this campaign already points at.
    db.select({ id: s.events.id, name: s.events.name, startsAt: s.events.startsAt, endsAt: s.events.endsAt })
      .from(s.events)
      .where(or(
        and(
          await cityWhere(s.events.cityId),
          notInArray(s.events.type, [...NON_OUTREACH_EVENT_TYPES]),
          humanCountableEvents(),
          notInArray(s.events.status, ["Canceled", "Lost"]),
          or(isNull(s.events.startsAt), gte(s.events.startsAt, todayISO())),
        ),
        c?.eventId ? eq(s.events.id, c.eventId) : inArray(s.events.id, []),
      ))
      .orderBy(asc(s.events.startsAt))
      .limit(200),
  ]);

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
          <PublicFormSettings
            initial={{
              publicForm: normalizePublicForm(defaults?.publicForm ?? c?.publicForm),
              eventId: c?.eventId ?? null,
              slotDate: c?.slotsStart?.slice(0, 10) ?? "",
              slotStartTime: c?.slotsStart?.slice(11, 16) ?? "",
              slotEndTime: c?.slotsEnd?.slice(11, 16) ?? "",
              slotCapacity: c?.slotCapacity ?? 1,
            }}
            events={events.map((e) => ({
              id: e.id, startsAt: e.startsAt, endsAt: e.endsAt,
              label: `${e.name} — ${e.startsAt ? fmtDate(e.startsAt) : "date TBD"}`,
            }))}
            error={screeningError} />
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
