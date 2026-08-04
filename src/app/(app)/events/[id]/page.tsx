import Link from "next/link";
import RecordActions from "@/components/RecordActions";
import type { SP } from "@/lib/lists";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { authorize } from "@/lib/scope";
import { and, count, desc, eq } from "drizzle-orm";
import { PageHeader, Card, CardHeader, Badge, BtnLink, RecordLink, LinkableMetric, Btn, Field, inputCls } from "@/components/ui";
import { saveEventOutcome } from "@/app/actions";
import { fmtDate, fmtDateTime, fmtMoney, todayISO } from "@/lib/dates";
import { qs } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function EventDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const { id: idStr } = await params;
  const id = Number(idStr);
  const event = await authorize(await db.query.events.findFirst({ where: eq(s.events.id, id) }));
  if (!event) notFound();

  const [account, contact, opportunity, campaign, partnerRow, leads, appointments, tasks, activities] = await Promise.all([
    event.accountId ? db.query.accounts.findFirst({ where: eq(s.accounts.id, event.accountId) }) : null,
    event.contactId ? db.query.contacts.findFirst({ where: eq(s.contacts.id, event.contactId) }) : null,
    event.opportunityId ? db.query.opportunities.findFirst({ where: eq(s.opportunities.id, event.opportunityId) }) : null,
    event.campaignId ? db.query.campaigns.findFirst({ where: eq(s.campaigns.id, event.campaignId) }) : null,
    event.partnerId
      ? db.select({ id: s.partners.id, name: s.accounts.name }).from(s.partners)
          .innerJoin(s.accounts, eq(s.partners.accountId, s.accounts.id)).where(eq(s.partners.id, event.partnerId))
      : Promise.resolve([]),
    db.query.leads.findMany({ where: eq(s.leads.eventId, id), orderBy: [desc(s.leads.createdAt)] }),
    db.query.appointments.findMany({ where: eq(s.appointments.eventId, id) }),
    db.query.tasks.findMany({ where: and(eq(s.tasks.eventId, id), eq(s.tasks.status, "Open")) }),
    db.query.activities.findMany({ where: eq(s.activities.eventId, id), orderBy: [desc(s.activities.occurredAt)], limit: 10 }),
  ]);
  const partner = partnerRow[0];

  const showed = appointments.filter((a) => a.status === "Showed").length;
  const charged = appointments.reduce((sum, a) => sum + a.revenue, 0) + event.revenue;
  const collected = appointments.reduce((sum, a) => sum + (a.collected ? a.revenue : 0), 0) + event.revenue;
  const isPastOrDone = (event.startsAt && event.startsAt <= todayISO() + "T99") || ["Completed", "Follow-Up Needed"].includes(event.status);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={event.name}
        subtitle={<span className="flex items-center gap-2"><Badge>{event.status}</Badge>
          <span className="text-soft">{event.type} · {fmtDateTime(event.startsAt)}{event.locationText ? ` · ${event.locationText}` : ""}</span></span>}
        actions={<>
          <BtnLink variant="outline" href={`/events/${id}/edit`}>Edit</BtnLink>
          <BtnLink variant="outline" href={`/leads/new${qs({ eventId: id, campaignId: event.campaignId, partnerId: event.partnerId, source: "Event" })}`}>Add Lead</BtnLink>
          <BtnLink href={`/activities/new${qs({ eventId: id, accountId: event.accountId, returnTo: `/events/${id}` })}`}>Log Activity</BtnLink>
        </>} />

      {/* Post-event results — clickable drill-downs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <LinkableMetric label="Attendees" value={event.actualAttendees || `${event.expectedAttendees} exp.`} href={`/leads${qs({ eventId: id })}`} />
        <LinkableMetric label="Leads Captured" value={leads.length} href={`/leads${qs({ eventId: id })}`} />
        <LinkableMetric label="Screenings" value={event.screeningsCompleted} href={`/leads${qs({ eventId: id })}`} />
        <LinkableMetric label="Appointments" value={appointments.length} sub={`${showed} showed`} href={`/appointments${qs({ eventId: id })}`} />
        <LinkableMetric label="Collected" value={fmtMoney(collected)} sub={`of ${fmtMoney(charged)} charged`} href={`/appointments${qs({ eventId: id })}`} accent />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Outcome form */}
          {isPastOrDone && (
            <Card>
              <CardHeader title="Event Outcomes" action={<span className="text-xs text-faint">Enter results after the event</span>} />
              <form action={saveEventOutcome} className="px-5 pb-5">
                <input type="hidden" name="id" value={id} />
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Actual attendees">
                    <input name="actualAttendees" type="number" min="0" defaultValue={event.actualAttendees} className={inputCls} />
                  </Field>
                  <Field label="Screenings completed">
                    <input name="screeningsCompleted" type="number" min="0" defaultValue={event.screeningsCompleted} className={inputCls} />
                  </Field>
                  <Field label="Event revenue ($, optional)">
                    <input name="revenue" type="number" min="0" step="10" defaultValue={event.revenue} className={inputCls} />
                  </Field>
                  <Field label="Follow-up required" className="md:col-span-2">
                    <label className="flex h-[38px] flex-wrap items-center gap-2 text-sm text-soft">
                      <input type="checkbox" name="followUpRequired" defaultChecked={event.followUpRequired} className="peer h-4 w-4 accent-[#d97706]" />
                      Yes, schedule it
                      <span className="hidden items-center gap-2 pl-2 peer-checked:flex">
                        <span className="text-[0.8rem] font-medium">due</span>
                        <input name="followUpDueAt" type="date" defaultValue={event.followUpDueAt?.slice(0, 10) ?? ""} className={inputCls + " !w-auto"} />
                      </span>
                    </label>
                  </Field>
                  <Field label="Outcome notes" className="md:col-span-3">
                    <textarea name="outcomeNotes" rows={2} defaultValue={event.outcomeNotes ?? ""} className={inputCls}
                      placeholder="What worked, what to improve, hot leads to chase…" />
                  </Field>
                </div>
                <div className="mt-4 flex justify-end">
                  <Btn type="submit" variant="accent">Save outcomes</Btn>
                </div>
              </form>
            </Card>
          )}

          <Card>
            <CardHeader title="Attendees & Leads" action={
              <Link href={`/leads/new${qs({ eventId: id, campaignId: event.campaignId, partnerId: event.partnerId, source: "Event" })}`}
                className="text-xs font-medium text-accent-deep hover:underline">+ Add lead</Link>} />
            {leads.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-faint">No leads captured yet.</p>
            ) : (
              <table className="tbl">
                <thead><tr><th>Name</th><th>Interest</th><th>Appt Status</th><th>Phone</th></tr></thead>
                <tbody>{leads.map((l) => (
                  <tr key={l.id}>
                    <td><RecordLink href={`/leads/${l.id}`}>{l.firstName} {l.lastName}</RecordLink></td>
                    <td><Badge>{l.interestLevel}</Badge></td>
                    <td><Badge>{l.apptStatus}</Badge></td>
                    <td className="text-soft">{l.phone ?? "—"}</td>
                  </tr>))}
                </tbody>
              </table>
            )}
          </Card>

          {activities.length > 0 && (
            <Card>
              <CardHeader title="Activity" />
              <ul className="px-5 pb-5">
                {activities.map((a) => (
                  <li key={a.id} className="relative border-l border-line py-2.5 pl-5">
                    <span className="absolute -left-[5px] top-[18px] h-2.5 w-2.5 rounded-full border-2 border-card bg-accent" />
                    <p className="text-sm"><span className="font-medium">{a.type}</span>
                      {a.outcome && <> · <Badge>{a.outcome}</Badge></>}
                      <span className="ml-2 text-xs text-faint">{fmtDateTime(a.occurredAt)}</span></p>
                    {a.notes && <p className="mt-0.5 text-sm text-soft">{a.notes}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Event Info" />
            <dl className="space-y-2 px-5 pb-5 text-sm">
              {([
                ["Host", account ? <RecordLink key="a" href={`/accounts/${account.id}`}>{account.name}</RecordLink> : "—"],
                ["Contact", contact ? <RecordLink key="c" href={`/contacts/${contact.id}`}>{contact.firstName} {contact.lastName}</RecordLink> : "—"],
                ["Opportunity", opportunity ? <RecordLink key="o" href={`/opportunities/${opportunity.id}`}>{opportunity.name}</RecordLink> : "—"],
                ["Campaign", campaign ? <RecordLink key="k" href={`/campaigns/${campaign.id}`}>{campaign.name}</RecordLink> : "—"],
                ["Partner", partner ? <RecordLink key="p" href={`/partners/${partner.id}`}>{partner.name}</RecordLink> : "—"],
                ["Booked on", fmtDate(event.bookedAt)],
                ["Follow-up", event.followUpRequired ? `Due ${fmtDate(event.followUpDueAt)}` : "Not required"],
              ] as [string, React.ReactNode][]).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="shrink-0 text-faint">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {event.notes && <p className="border-t border-hairline px-5 py-4 text-sm text-soft">{event.notes}</p>}
            {event.outcomeNotes && (
              <div className="border-t border-hairline px-5 py-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">Outcome notes</p>
                <p className="text-sm text-soft">{event.outcomeNotes}</p>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Follow-Up Tasks" action={
              <Link href={`/tasks/new${qs({ eventId: id, accountId: event.accountId })}`} className="text-xs font-medium text-accent-deep hover:underline">+ New</Link>} />
            {tasks.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-faint">Nothing pending.</p>
            ) : (
              <ul className="px-2 pb-2">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <Link href={`/tasks/${t.id}`} className="block rounded-xl px-3 py-2 transition-colors hover:bg-hairline">
                      <span className="block text-sm font-medium">{t.title}</span>
                      <span className="block text-xs text-soft">Due {fmtDate(t.dueDate)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <RecordActions kind="event" id={id} name={event.name} sp={sp} />
    </div>
  );
}
