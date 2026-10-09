import Link from "next/link";
import RecordActions from "@/components/RecordActions";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { db, schema as s } from "@/db";
import { authorize } from "@/lib/scope";
import { count, desc, eq, sql } from "drizzle-orm";
import { PageHeader, Card, CardHeader, Badge, BtnLink, RecordLink, LinkableMetric } from "@/components/ui";
import DocumentsCard from "@/components/DocumentsCard";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/dates";
import { qs } from "@/lib/metrics";
import { normalizePublicForm, isScreeningForm } from "@/lib/taxonomy";
import { timeSheets } from "@/lib/screening-intake";
import ScreeningTimeSheet from "@/components/ScreeningTimeSheet";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const dynamic = "force-dynamic";

export default async function CampaignDetail({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  const id = Number(idStr);
  const campaign = await authorize(await db.query.campaigns.findFirst({ where: eq(s.campaigns.id, id) }));
  if (!campaign) notFound();
  const formType = normalizePublicForm(campaign.publicForm);

  const [account, screeningEvent, sheets, leads, events, oppCount, apptStats, showedCount, docs] = await Promise.all([
    campaign.accountId ? db.query.accounts.findFirst({ where: eq(s.accounts.id, campaign.accountId) }) : null,
    campaign.eventId && isScreeningForm(formType)
      ? db.query.events.findFirst({ where: eq(s.events.id, campaign.eventId), columns: { id: true, name: true, startsAt: true } })
      : null,
    timeSheets([campaign]),
    db.query.leads.findMany({ where: eq(s.leads.campaignId, id), orderBy: [desc(s.leads.createdAt)] }),
    db.query.events.findMany({ where: eq(s.events.campaignId, id), orderBy: [desc(s.events.startsAt)] }),
    db.select({ c: count() }).from(s.opportunities).where(eq(s.opportunities.campaignId, id)),
    db.select({
      c: count(),
      charged: sql<number>`coalesce(sum(${s.appointments.revenue}),0)`,
      collected: sql<number>`coalesce(sum(case when ${s.appointments.collected} then ${s.appointments.revenue} else 0 end),0)`,
    }).from(s.appointments).where(eq(s.appointments.campaignId, id)),
    db.select({ c: count() }).from(s.appointments).where(sql`${s.appointments.campaignId} = ${id} and ${s.appointments.status} = 'Showed'`),
    db.query.documents.findMany({
      where: eq(s.documents.campaignId, id),
      orderBy: [desc(s.documents.createdAt)],
      columns: { id: true, name: true, fileName: true, mimeType: true, size: true, createdAt: true },
    }),
  ]);

  const appts = Number(apptStats[0]?.c ?? 0);
  const conversion = leads.length > 0 ? Math.round((appts / leads.length) * 100) : 0;

  // Public QR sign-up link — scans land on /join/<token> and become leads here.
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https";
  const joinUrl = campaign.publicToken ? `${proto}://${host}/join/${campaign.publicToken}` : null;
  const qrDataUrl = joinUrl
    ? await QRCode.toDataURL(joinUrl, { width: 480, margin: 2, color: { dark: "#1c1c1e", light: "#ffffff" } })
    : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={campaign.name}
        subtitle={<span className="flex items-center gap-2"><Badge>{campaign.status}</Badge>
          <span className="text-soft">{campaign.type}</span>
          {campaign.offer && <span className="text-soft">· {campaign.offer}</span>}</span>}
        actions={<>
          <BtnLink variant="outline" href={`/campaigns/${id}/edit`}>Edit</BtnLink>
          <BtnLink href={`/leads/new${qs({ campaignId: id, accountId: campaign.accountId })}`}>Add Lead</BtnLink>
        </>} />

      {/* Campaign funnel — deterministic, every number clickable */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <LinkableMetric label="Leads Generated" value={leads.length} href={`/leads${qs({ campaignId: id })}`} />
        <LinkableMetric label="Opportunities" value={Number(oppCount[0]?.c ?? 0)} href={`/opportunities${qs({ campaignId: id })}`} />
        <LinkableMetric label="Events" value={events.length} href={`/events${qs({ campaignId: id })}`} />
        <LinkableMetric label="Appointments" value={appts} href={`/appointments${qs({ campaignId: id })}`} />
        <LinkableMetric label="Showed" value={Number(showedCount[0]?.c ?? 0)} href={`/appointments${qs({ campaignId: id, status: "Showed" })}`} />
        <LinkableMetric label="Lead → Appt" value={`${conversion}%`} href={`/appointments${qs({ campaignId: id })}`} accent
          sub={`${fmtMoney(Number(apptStats[0]?.collected ?? 0))} of ${fmtMoney(Number(apptStats[0]?.charged ?? 0))} collected`} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {sheets.get(id) && <ScreeningTimeSheet sheet={sheets.get(id)!} editHref={`/campaigns/${id}/edit`} />}

          <Card>
            <CardHeader title="Leads From This Campaign" action={
              <Link href={`/leads${qs({ campaignId: id })}`} className="text-xs font-medium text-accent-deep hover:underline">View all</Link>} />
            {leads.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-faint">No leads yet — add them as cards/scans come in.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>Name</th><th>Interest</th><th>Appt Status</th><th>Added</th></tr></thead>
                  <tbody>{leads.slice(0, 12).map((l) => (
                    <tr key={l.id}>
                      <td><RecordLink href={`/leads/${l.id}`}>{l.firstName} {l.lastName}</RecordLink></td>
                      <td><Badge>{l.interestLevel}</Badge></td>
                      <td><Badge>{l.apptStatus}</Badge></td>
                      <td className="text-soft">{fmtDate(l.createdAt)}</td>
                    </tr>))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {events.length > 0 && (
            <Card>
              <CardHeader title="Events" />
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

          <DocumentsCard title="Materials & Documents" docs={docs} attach={{ campaignId: id }}
            returnTo={`/campaigns/${id}`} error={spStr(sp, "docerror")} />
        </div>

        <div className="space-y-5">
          {qrDataUrl && joinUrl && (
            <Card>
              <CardHeader title="QR Sign-Up" action={
                <a href={qrDataUrl} download={`qr-${campaign.publicToken}.png`}
                  className="text-xs font-medium text-accent-deep hover:underline">Download PNG</a>} />
              <div className="flex flex-col items-center px-5 pb-5">
                {/* white tile so the QR scans in dark mode too */}
                <div className="rounded-xl bg-white p-3 shadow-card">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrDataUrl} alt={`QR code for ${campaign.name} sign-up`} className="h-44 w-44" />
                </div>
                <a href={joinUrl} target="_blank" className="mt-3 break-all text-center text-xs font-medium text-accent-deep hover:underline">
                  {joinUrl.replace(/^https?:\/\//, "")}
                </a>
                <p className="mt-2 text-center text-xs text-faint">
                  {formType === "patient"
                    ? "New-patient sign-up — submissions appear under Leads, attributed to this campaign automatically."
                    : formType === "partnership"
                    ? "Business partnership form — asks what kind of partnership fits. Scans create the business under Accounts, a contact, and a lead, all attributed to this campaign."
                    : formType === "contact"
                    ? "General contact form — first name and phone required; email, an \"already a patient\" box and a question are optional. Submissions appear under Leads with those answers in the notes, attributed to this campaign."
                    : formType === "screening"
                    ? "Screening intake — people confirm they want to take part in the spinal health screening, with name, phone, email and current symptoms. Each becomes a lead, attributed to this campaign and its event."
                    : formType === "screening_slots"
                    ? "Screening intake with times — the same, plus a 10-minute window. Bookings fill the time sheet here and on the event; when every window is full, people join a waitlist."
                    : "Lunch & learn form — asks about team size, space, and timing. Scans create the business under Accounts, a contact, and a lead, all attributed to this campaign."}
                </p>
                <p className="mt-1.5 rounded-full bg-hairline px-2.5 py-0.5 text-xs font-medium text-soft">
                  {formType === "patient" ? "Collects: patient info"
                    : formType === "partnership" ? "Collects: partnership interest"
                    : formType === "contact" ? "Collects: contact details, existing patient?, question"
                    : formType === "screening" ? "Collects: screening sign-up + symptoms"
                    : formType === "screening_slots" ? "Collects: screening sign-up, symptoms + a time"
                    : "Collects: lunch & learn interest"}
                </p>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Campaign Info" />
            <dl className="space-y-2 px-5 pb-5 text-sm">
              {([
                ["Type", campaign.type],
                ["Account", account ? <RecordLink key="a" href={`/accounts/${account.id}`}>{account.name}</RecordLink> : "—"],
                ...(isScreeningForm(formType) ? [["Screening event", screeningEvent
                  ? <RecordLink key="se" href={`/events/${screeningEvent.id}`}>{screeningEvent.name}</RecordLink>
                  : "Not tied to an event"] as [string, React.ReactNode]] : []),
                ["Start", fmtDate(campaign.startDate)],
                ["End", fmtDate(campaign.endDate)],
                ["Tracking link", campaign.trackingUrl
                  ? <a key="t" href={campaign.trackingUrl} target="_blank" className="break-all text-accent-deep hover:underline">{campaign.trackingUrl.replace(/^https?:\/\//, "")}</a>
                  : "—"],
              ] as [string, React.ReactNode][]).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="shrink-0 text-faint">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {campaign.notes && <p className="border-t border-hairline px-5 py-4 text-sm text-soft">{campaign.notes}</p>}
          </Card>
        </div>
      </div>

      <RecordActions kind="campaign" id={id} name={campaign.name} sp={sp} />
    </div>
  );
}
