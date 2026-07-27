import Link from "next/link";
import RecordActions from "@/components/RecordActions";
import type { SP } from "@/lib/lists";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { authorize } from "@/lib/scope";
import { count, desc, eq, sql } from "drizzle-orm";
import { PageHeader, Card, CardHeader, Badge, BtnLink, RecordLink, LinkableMetric, Btn, Field, inputCls } from "@/components/ui";
import { recordDropBoxPickup } from "@/app/actions";
import { fmtDate, fmtDateTime, fmtMoney, todayISO } from "@/lib/dates";
import { qs } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function PartnerDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const { id: idStr } = await params;
  const id = Number(idStr);
  const partner = await authorize(await db.query.partners.findFirst({ where: eq(s.partners.id, id) }));
  if (!partner) notFound();

  const [account, contact, location, campaigns, events, leadCount, apptStats, lunchAndLearns, activities, winners] = await Promise.all([
    db.query.accounts.findFirst({ where: eq(s.accounts.id, partner.accountId) }),
    partner.mainContactId ? db.query.contacts.findFirst({ where: eq(s.contacts.id, partner.mainContactId) }) : null,
    partner.clinicLocationId ? db.query.locations.findFirst({ where: eq(s.locations.id, partner.clinicLocationId) }) : null,
    db.query.campaigns.findMany({ where: eq(s.campaigns.partnerId, id) }),
    db.query.events.findMany({ where: eq(s.events.partnerId, id), orderBy: [desc(s.events.startsAt)] }),
    db.select({ c: count() }).from(s.leads).where(eq(s.leads.partnerId, id)),
    db.select({
      c: count(),
      charged: sql<number>`coalesce(sum(${s.appointments.revenue}),0)`,
      collected: sql<number>`coalesce(sum(case when ${s.appointments.collected} then ${s.appointments.revenue} else 0 end),0)`,
    }).from(s.appointments).where(eq(s.appointments.partnerId, id)),
    db.select({ c: count() }).from(s.events).where(sql`${s.events.partnerId} = ${id} and ${s.events.type} in ('Lunch and Learn','Office Visit')`),
    db.query.activities.findMany({ where: eq(s.activities.partnerId, id), orderBy: [desc(s.activities.occurredAt)], limit: 10 }),
    // Winning businesses = accounts attached to appointments sourced from this partner
    db.selectDistinct({ id: s.accounts.id, name: s.accounts.name })
      .from(s.appointments)
      .innerJoin(s.accounts, eq(s.appointments.accountId, s.accounts.id))
      .where(eq(s.appointments.partnerId, id)),
  ]);
  if (!account) notFound();

  const pickupDue = partner.dropBoxActive && partner.nextPickupDueAt && partner.nextPickupDueAt <= todayISO();

  const info: [string, React.ReactNode][] = [
    ["Business", <RecordLink key="b" href={`/accounts/${account.id}`}>{account.name}</RecordLink>],
    ["Type", partner.partnerType],
    ["Since", fmtDate(partner.startDate)],
    ["Main contact", contact ? <RecordLink key="c" href={`/contacts/${contact.id}`}>{contact.firstName} {contact.lastName}</RecordLink> : "—"],
    ["Illumin8 location", location?.name ?? "—"],
    ["Benefits", partner.benefits ?? "—"],
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={account.name}
        subtitle={<span className="flex items-center gap-2"><Badge>{partner.status}</Badge><span className="text-soft">{partner.partnerType}</span></span>}
        actions={<>
          <BtnLink variant="outline" href={`/partners/${id}/edit`}>Edit</BtnLink>
          <BtnLink href={`/activities/new${qs({ partnerId: id, accountId: account.id, returnTo: `/partners/${id}` })}`}>Log Activity</BtnLink>
        </>} />

      {/* Partner performance — every number drills into source records */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <LinkableMetric label="Leads Generated" value={Number(leadCount[0]?.c ?? 0)} href={`/leads${qs({ partnerId: id })}`} />
        <LinkableMetric label="Events" value={events.length} href={`/events${qs({ partnerId: id })}`} />
        <LinkableMetric label="Lunch & Learns / Visits" value={Number(lunchAndLearns[0]?.c ?? 0)} href={`/events${qs({ partnerId: id })}`} />
        <LinkableMetric label="Appointments" value={Number(apptStats[0]?.c ?? 0)} href={`/appointments${qs({ partnerId: id })}`} />
        <LinkableMetric label="Collected / Charged" value={fmtMoney(Number(apptStats[0]?.collected ?? 0))}
          sub={`of ${fmtMoney(Number(apptStats[0]?.charged ?? 0))} charged`} href={`/appointments${qs({ partnerId: id })}`} accent />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {partner.dropBoxActive && (
            <Card className={pickupDue ? "ring-2 ring-warn/40" : ""}>
              <CardHeader title="Drop Box" action={<Badge>{partner.dropBoxStatus ?? "Placed"}</Badge>} />
              <div className="grid gap-x-8 gap-y-2 px-5 pb-4 text-sm md:grid-cols-2">
                <p className="flex justify-between"><span className="text-faint">Cards collected</span><span className="font-medium">{partner.cardsCollected}</span></p>
                <p className="flex justify-between"><span className="text-faint">Last pickup</span><span className="font-medium">{fmtDate(partner.lastPickupAt)}</span></p>
                <p className="flex justify-between"><span className="text-faint">Next pickup due</span>
                  <span className={`font-medium ${pickupDue ? "text-bad" : ""}`}>{fmtDate(partner.nextPickupDueAt)}</span></p>
                <p className="flex justify-between"><span className="text-faint">Revenue spent here</span><span className="font-medium">{fmtMoney(partner.revenueSpent)}</span></p>
                {partner.lunchOffer && <p className="flex justify-between md:col-span-2"><span className="text-faint">Lunch offer</span><span className="font-medium">{partner.lunchOffer}</span></p>}
                {partner.cateringInfo && <p className="flex justify-between md:col-span-2"><span className="text-faint">Catering</span><span className="font-medium">{partner.cateringInfo}</span></p>}
              </div>
              <form action={recordDropBoxPickup} className="flex items-end gap-3 border-t border-hairline px-5 py-4">
                <input type="hidden" name="id" value={id} />
                <Field label="Log a pickup — cards collected" className="w-56">
                  <input name="cards" type="number" min="0" defaultValue={0} className={inputCls} />
                </Field>
                <Btn type="submit" variant="accent">Record pickup</Btn>
              </form>
            </Card>
          )}

          <Card>
            <CardHeader title="Events With This Partner" action={
              <Link href={`/events/new${qs({ partnerId: id, accountId: account.id })}`} className="text-xs font-medium text-accent-deep hover:underline">+ New</Link>} />
            {events.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-faint">No events yet.</p>
            ) : (
              <table className="tbl">
                <thead><tr><th>Event</th><th>Date</th><th>Status</th><th>Screenings</th></tr></thead>
                <tbody>{events.map((e) => (
                  <tr key={e.id}>
                    <td><RecordLink href={`/events/${e.id}`}>{e.name}</RecordLink></td>
                    <td className="text-soft">{fmtDateTime(e.startsAt)}</td>
                    <td><Badge>{e.status}</Badge></td>
                    <td className="text-soft">{e.screeningsCompleted}</td>
                  </tr>))}
                </tbody>
              </table>
            )}
          </Card>

          <Card>
            <CardHeader title="Recent Activity" action={
              <Link href={`/activities${qs({ partnerId: id })}`} className="text-xs font-medium text-accent-deep hover:underline">View all</Link>} />
            {activities.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-faint">No activity logged.</p>
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
            <CardHeader title="Partner Info" />
            <dl className="space-y-2 px-5 pb-5 text-sm">
              {info.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="shrink-0 text-faint">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {partner.notes && <p className="border-t border-hairline px-5 py-4 text-sm text-soft">{partner.notes}</p>}
          </Card>

          <Card>
            <CardHeader title="Campaigns" action={
              <Link href={`/campaigns/new${qs({ partnerId: id, accountId: account.id })}`} className="text-xs font-medium text-accent-deep hover:underline">+ New</Link>} />
            {campaigns.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-faint">No campaigns linked.</p>
            ) : (
              <ul className="px-2 pb-2">
                {campaigns.map((c) => (
                  <li key={c.id}>
                    <Link href={`/campaigns/${c.id}`} className="block rounded-xl px-3 py-2 transition-colors hover:bg-hairline">
                      <span className="flex items-center justify-between text-sm font-medium">{c.name}<Badge>{c.status}</Badge></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {winners.length > 0 && (
            <Card>
              <CardHeader title="Winning Businesses" />
              <ul className="px-2 pb-2">
                {winners.map((w) => (
                  <li key={w.id}>
                    <Link href={`/accounts/${w.id}`} className="block rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-hairline">
                      {w.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <RecordActions kind="partner" id={id} name={account?.name ?? 'this partner'} sp={sp} />
    </div>
  );
}
