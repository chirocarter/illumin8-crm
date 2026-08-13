import Link from "next/link";
import RecordActions from "@/components/RecordActions";
import type { SP } from "@/lib/lists";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { authorize } from "@/lib/scope";
import { and, desc, eq } from "drizzle-orm";
import { PageHeader, Card, CardHeader, Badge, BtnLink, RecordLink, EmptyState, Btn, selectCls } from "@/components/ui";
import { setOpportunityStage } from "@/app/actions";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/dates";
import { qs } from "@/lib/metrics";
import { OPPORTUNITY_STAGES } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";

export default async function OpportunityDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const { id: idStr } = await params;
  const id = Number(idStr);
  const opp = await authorize(await db.query.opportunities.findFirst({ where: eq(s.opportunities.id, id) }));
  if (!opp) notFound();

  const [account, contact, campaign, location, activities, events, tasks] = await Promise.all([
    opp.accountId ? db.query.accounts.findFirst({ where: eq(s.accounts.id, opp.accountId) }) : null,
    opp.contactId ? db.query.contacts.findFirst({ where: eq(s.contacts.id, opp.contactId) }) : null,
    opp.campaignId ? db.query.campaigns.findFirst({ where: eq(s.campaigns.id, opp.campaignId) }) : null,
    opp.clinicLocationId ? db.query.locations.findFirst({ where: eq(s.locations.id, opp.clinicLocationId) }) : null,
    db.query.activities.findMany({ where: eq(s.activities.opportunityId, id), orderBy: [desc(s.activities.occurredAt)] }),
    db.query.events.findMany({ where: eq(s.events.opportunityId, id) }),
    db.query.tasks.findMany({ where: and(eq(s.tasks.opportunityId, id), eq(s.tasks.status, "Open")), orderBy: [s.tasks.dueDate] }),
  ]);

  const info: [string, React.ReactNode][] = [
    ["Account", account ? <RecordLink key="a" href={`/accounts/${account.id}`}>{account.name}</RecordLink> : "—"],
    ["Primary contact", contact ? <RecordLink key="c" href={`/contacts/${contact.id}`}>{contact.firstName} {contact.lastName}</RecordLink> : "—"],
    ["Type", opp.type],
    ["Expected event date", fmtDate(opp.expectedEventDate)],
    ["Next follow-up", fmtDate(opp.nextFollowUpAt)],
    ["Source campaign", campaign ? <RecordLink key="k" href={`/campaigns/${campaign.id}`}>{campaign.name}</RecordLink> : "—"],
    ["Illumin8 location", location?.name ?? "—"],
    ["In stage since", fmtDate(opp.stageChangedAt)],
    ["Created", fmtDate(opp.createdAt)],
  ];
  if (opp.lossReason) info.push(["Loss reason", opp.lossReason]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={opp.name}
        subtitle={<span className="flex items-center gap-2"><Badge>{opp.stage}</Badge>
          {opp.nextStep && <span className="text-soft">Next: {opp.nextStep}</span>}</span>}
        actions={<>
          <BtnLink variant="outline" href={`/opportunities/${id}/edit`}>Edit</BtnLink>
          <BtnLink variant="outline" href={`/events/new${qs({ opportunityId: id, accountId: opp.accountId, contactId: opp.contactId })}`}>Create Event</BtnLink>
          <BtnLink href={`/activities/new${qs({ opportunityId: id, accountId: opp.accountId, contactId: opp.contactId, returnTo: `/opportunities/${id}` })}`}>Log Activity</BtnLink>
        </>} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Quick stage move */}
          <Card className="p-4">
            <form action={setOpportunityStage} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="returnTo" value={`/opportunities/${id}`} />
              <label className="flex-1">
                <span className="mb-1.5 block text-[0.8rem] font-medium text-soft">Move to stage</span>
                <select name="stage" defaultValue={opp.stage} className={selectCls}>
                  {OPPORTUNITY_STAGES.map((st) => <option key={st}>{st}</option>)}
                </select>
              </label>
              <Btn type="submit" variant="outline">Update stage</Btn>
            </form>
          </Card>

          {events.length > 0 && (
            <Card>
              <CardHeader title="Linked Events" />
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>Event</th><th>Date</th><th>Status</th></tr></thead>
                  <tbody>{events.map((e) => (
                    <tr key={e.id}>
                      <td><RecordLink href={`/events/${e.id}`}>{e.name}</RecordLink></td>
                      <td className="text-soft">{fmtDateTime(e.startsAt)}</td>
                      <td><Badge>{e.status}</Badge></td>
                    </tr>))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Activity Timeline" action={
              <Link href={`/activities${qs({ opportunityId: id })}`} className="text-xs font-medium text-accent-deep hover:underline">View all</Link>} />
            {activities.length === 0 ? (
              <EmptyState icon="bolt" title="No activity on this opportunity yet"
                action={<BtnLink variant="outline" href={`/activities/new${qs({ opportunityId: id, accountId: opp.accountId })}`}>Log the first touch</BtnLink>} />
            ) : (
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
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Details" />
            <dl className="space-y-2 px-5 pb-5 text-sm">
              {info.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="shrink-0 text-faint">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {opp.notes && <p className="border-t border-hairline px-5 py-4 text-sm text-soft">{opp.notes}</p>}
          </Card>

          <Card>
            <CardHeader title="Open Tasks" action={
              <Link href={`/tasks/new${qs({ opportunityId: id, accountId: opp.accountId, contactId: opp.contactId })}`} className="text-xs font-medium text-accent-deep hover:underline">+ New</Link>} />
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

      <RecordActions kind="opportunity" id={id} name={opp.name} sp={sp} />
    </div>
  );
}
