import { PageHeader, Card, CardHeader, DrillNumber, RecordLink } from "@/components/ui";
import { db, schema as s } from "@/db";
import { and, inArray, sql } from "drizzle-orm";
import { fmtDateLong, fmtMoney } from "@/lib/dates";
import { qs, outreachEventsOnly } from "@/lib/metrics";
import { activeCity, scopeConds } from "@/lib/scope";
import { humanCountableEvents } from "@/lib/ai-review";
import { appointmentViaAccount, eventViaAccount, leadViaAccount } from "@/lib/partners";
import { ACTIVE_PARTNER, PAST_PARTNER } from "@/lib/taxonomy";

export const metadata = { title: "Partner Report" };
export const dynamic = "force-dynamic";

// A partner is a business whose status is Active Partner or Past Partner — the
// same businesses as the Partners page, plus the ones whose partnership ended.
// What counts as "produced by" a partner is defined once in lib/partners, and
// every number below opens a list filtered by that same rule.
const acct = sql`accounts.id`;

export default async function PartnerReport() {
  // Pinned to the active city — another market's partners and campaigns
  // don't belong in this city's workflow view.
  const city = (await activeCity())?.id ?? null;

  const partners = await db
    .select({
      id: s.accounts.id, name: s.accounts.name, status: s.accounts.status,
      vertical: s.accounts.vertical, partnerSince: s.accounts.partnerSince,
      leads: sql<number>`(select count(*) from leads where ${leadViaAccount(acct)})`,
      // Outreach events only, and only ones a person has accepted: a meeting
      // is not an event, and an AI suggestion is not a booking.
      events: sql<number>`(select count(*) from events where ${eventViaAccount(acct)} and ${humanCountableEvents()} and ${outreachEventsOnly()})`,
      appts: sql<number>`(select count(*) from appointments where ${appointmentViaAccount(acct)})`,
      showed: sql<number>`(select count(*) from appointments where ${appointmentViaAccount(acct)} and appointments.status = 'Showed')`,
      charged: sql<number>`(select coalesce(sum(appointments.revenue), 0) from appointments where ${appointmentViaAccount(acct)})`,
      collected: sql<number>`(select coalesce(sum(case when appointments.collected then appointments.revenue else 0 end), 0) from appointments where ${appointmentViaAccount(acct)})`,
    })
    .from(s.accounts)
    .where(and(inArray(s.accounts.status, [ACTIVE_PARTNER, PAST_PARTNER]), ...scopeConds(s.accounts, { cityId: city })));

  const campaigns = await db
    .select({
      id: s.campaigns.id, name: s.campaigns.name, type: s.campaigns.type,
      leads: sql<number>`(select count(*) from leads where leads.campaign_id = campaigns.id)`,
      appts: sql<number>`(select count(*) from appointments where appointments.campaign_id = campaigns.id)`,
      collected: sql<number>`(select coalesce(sum(case when appointments.collected then appointments.revenue else 0 end),0) from appointments where appointments.campaign_id = campaigns.id)`,
    })
    .from(s.campaigns)
    .where(and(...scopeConds(s.campaigns, { cityId: city })));

  // Most appointments first, then most leads, then A→Z so ties don't shuffle.
  const sorted = [...partners].sort((a, b) =>
    Number(b.appts) - Number(a.appts) || Number(b.leads) - Number(a.leads) || a.name.localeCompare(b.name));
  const active = sorted.filter((p) => p.status === ACTIVE_PARTNER);
  const past = sorted.filter((p) => p.status === PAST_PARTNER);
  const bestCampaigns = [...campaigns].sort((a, b) => Number(b.leads) - Number(a.leads));

  const section = (id: string, title: string, rows: typeof sorted, empty: string) => (
    <Card className="mt-5">
      <div id={id} className="scroll-mt-20">
        <CardHeader title={`${title} · ${rows.length}`} />
      </div>
      {rows.length === 0 ? <p className="px-5 pb-4 text-sm text-faint">{empty}</p> : (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr>
              <th className="min-w-[11rem]">Partner</th><th className="text-right">Leads</th><th className="text-right">Events</th>
              <th className="text-right">Appointments</th><th className="text-right">Showed</th>
              <th className="text-right">Charged</th><th className="text-right">Collected</th>
            </tr></thead>
            <tbody>
              {rows.map((p) => {
                const via = { viaAccountId: p.id };
                return (
                  <tr key={p.id}>
                    <td><RecordLink href={`/accounts/${p.id}`}>{p.name}</RecordLink>
                      <span className="block text-xs text-faint">
                        {[p.vertical, p.partnerSince ? `Partner since ${fmtDateLong(p.partnerSince)}` : null].filter(Boolean).join(" · ")}
                      </span></td>
                    <td className="text-right"><DrillNumber value={Number(p.leads)} href={`/leads${qs(via)}`} /></td>
                    <td className="text-right"><DrillNumber value={Number(p.events)} href={`/events${qs({ ...via, outreach: "1" })}`} /></td>
                    <td className="text-right"><DrillNumber value={Number(p.appts)} href={`/appointments${qs(via)}`} /></td>
                    <td className="text-right"><DrillNumber value={Number(p.showed)} href={`/appointments${qs({ ...via, status: "Showed" })}`} /></td>
                    <td className="text-right"><DrillNumber value={fmtMoney(Number(p.charged))} href={`/appointments${qs(via)}`} /></td>
                    <td className="text-right"><DrillNumber value={fmtMoney(Number(p.collected))} href={`/appointments${qs({ ...via, collected: "1" })}`} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Partner Report" subtitle="What each partnership produced, all time — sorted by appointments" />

      {section("active", "Active Partners", active, "No active partners in this city.")}
      {section("past", "Past Partners", past,
        "None yet. When a partnership ends, set the business to Past Partner and it moves here, numbers intact.")}

      <p className="mt-3 px-1 text-xs text-faint">
        A lead, event or appointment counts for a partner when it&rsquo;s linked to the business, came through
        one of its campaigns, or came from an event it hosted. Events exclude meetings.
      </p>

      <Card className="mt-5">
        <CardHeader title="Best-Performing Campaigns" />
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Campaign</th><th>Type</th><th className="text-right">Leads</th><th className="text-right">Appointments</th><th className="text-right">Lead → Appt</th><th className="text-right">Collected</th></tr></thead>
            <tbody>
              {bestCampaigns.map((c) => (
                <tr key={c.id}>
                  <td><RecordLink href={`/campaigns/${c.id}`}>{c.name}</RecordLink></td>
                  <td className="text-soft">{c.type}</td>
                  <td className="text-right"><DrillNumber value={Number(c.leads)} href={`/leads${qs({ campaignId: c.id })}`} /></td>
                  <td className="text-right"><DrillNumber value={Number(c.appts)} href={`/appointments${qs({ campaignId: c.id })}`} /></td>
                  <td className="text-right text-soft">{Number(c.leads) > 0 ? `${Math.round((Number(c.appts) / Number(c.leads)) * 100)}%` : "—"}</td>
                  <td className="text-right text-soft">{fmtMoney(Number(c.collected))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
