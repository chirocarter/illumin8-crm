import { notFound } from "next/navigation";
import RecordActions from "@/components/RecordActions";
import type { SP } from "@/lib/lists";
import { db, schema as s } from "@/db";
import { authorize } from "@/lib/scope";
import { eq } from "drizzle-orm";
import { PageHeader, Card, CardHeader, Badge, BtnLink, Btn, RecordLink } from "@/components/ui";
import { convertLeadToContact } from "@/app/actions";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/dates";
import { qs } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function LeadDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const { id: idStr } = await params;
  const id = Number(idStr);
  const lead = await authorize(await db.query.leads.findFirst({ where: eq(s.leads.id, id) }));
  if (!lead) notFound();

  const [campaign, event, partnerRow, account, location, appointments, activities] = await Promise.all([
    lead.campaignId ? db.query.campaigns.findFirst({ where: eq(s.campaigns.id, lead.campaignId) }) : null,
    lead.eventId ? db.query.events.findFirst({ where: eq(s.events.id, lead.eventId) }) : null,
    lead.partnerId
      ? db.select({ id: s.partners.id, name: s.accounts.name }).from(s.partners)
          .innerJoin(s.accounts, eq(s.partners.accountId, s.accounts.id)).where(eq(s.partners.id, lead.partnerId))
      : Promise.resolve([]),
    lead.accountId ? db.query.accounts.findFirst({ where: eq(s.accounts.id, lead.accountId) }) : null,
    lead.preferredLocationId ? db.query.locations.findFirst({ where: eq(s.locations.id, lead.preferredLocationId) }) : null,
    db.query.appointments.findMany({ where: eq(s.appointments.leadId, id) }),
    db.query.activities.findMany({ where: eq(s.activities.leadId, id), orderBy: (a, { desc }) => [desc(a.occurredAt)] }),
  ]);
  const partner = partnerRow[0];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={`${lead.firstName} ${lead.lastName}`}
        subtitle={<span className="flex items-center gap-2"><Badge>{lead.apptStatus}</Badge><Badge>{lead.interestLevel}</Badge>
          <span className="text-soft">Added {fmtDate(lead.createdAt)}</span></span>}
        actions={<>
          <BtnLink variant="outline" href={`/leads/${id}/edit`}>Edit</BtnLink>
          <form action={convertLeadToContact}>
            <input type="hidden" name="id" value={id} />
            <Btn type="submit" variant="outline" title="Create a contact from this lead — for people who turn out to be business relationships">
              Make Contact
            </Btn>
          </form>
          <BtnLink variant="outline" href={`/activities/new${qs({ leadId: id, returnTo: `/leads/${id}` })}`}>Log Activity</BtnLink>
          <BtnLink href={`/appointments/new${qs({ leadId: id, eventId: lead.eventId, campaignId: lead.campaignId, partnerId: lead.partnerId, accountId: lead.accountId, locationId: lead.preferredLocationId, source: lead.source })}`}>
            Book Appointment
          </BtnLink>
        </>} />

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader title="Lead Info" />
          <dl className="space-y-2 px-5 pb-5 text-sm">
            {([
              ["Phone", lead.phone ?? "—"],
              ["Email", lead.email ?? "—"],
              ["Preferred location", location?.name ?? "—"],
              ["Interest", lead.interestLevel],
              ["Status", lead.apptStatus],
            ] as [string, React.ReactNode][]).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="shrink-0 text-faint">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {lead.notes && <p className="border-t border-hairline px-5 py-4 text-sm text-soft">{lead.notes}</p>}
        </Card>

        <Card>
          <CardHeader title="Source Attribution" />
          <dl className="space-y-2 px-5 pb-5 text-sm">
            {([
              ["Source", lead.source ?? "—"],
              ["Campaign", campaign ? <RecordLink key="c" href={`/campaigns/${campaign.id}`}>{campaign.name}</RecordLink> : "—"],
              ["Event", event ? <RecordLink key="e" href={`/events/${event.id}`}>{event.name}</RecordLink> : "—"],
              ["Partner", partner ? <RecordLink key="p" href={`/partners/${partner.id}`}>{partner.name}</RecordLink> : "—"],
              ["Business", account ? <RecordLink key="a" href={`/accounts/${account.id}`}>{account.name}</RecordLink> : "—"],
            ] as [string, React.ReactNode][]).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="shrink-0 text-faint">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {activities.length > 0 && (
          <Card className="md:col-span-2">
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

        <Card className="md:col-span-2">
          <CardHeader title="Appointments" action={
            <BtnLink variant="ghost" href={`/appointments/new${qs({ leadId: id })}`}>+ Book</BtnLink>} />
          {appointments.length === 0 ? (
            <p className="px-5 pb-4 text-sm text-faint">No appointments yet — book one when they&apos;re ready.</p>
          ) : (
            <table className="tbl">
              <thead><tr><th>When</th><th>Status</th><th>Charged</th><th>Collected?</th></tr></thead>
              <tbody>{appointments.map((a) => (
                <tr key={a.id}>
                  <td><RecordLink href={`/appointments/${a.id}/edit`}>{fmtDateTime(a.scheduledAt)}</RecordLink></td>
                  <td><Badge>{a.status}</Badge></td>
                  <td className="text-soft">{a.revenue ? fmtMoney(a.revenue) : "—"}</td>
                  <td>{a.revenue ? (a.collected ? <span className="font-medium text-good">Yes</span> : <span className="text-warn">Not yet</span>) : <span className="text-faint">—</span>}</td>
                </tr>))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <RecordActions kind="lead" id={id} name={`${lead.firstName} ${lead.lastName}`.trim()} sp={sp} />
    </div>
  );
}
