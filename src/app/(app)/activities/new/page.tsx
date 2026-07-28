import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import ActivityWizard from "@/components/ActivityWizard";
import { cityWhere } from "@/lib/scope";
import type { SP } from "@/lib/lists";
import { spStr } from "@/lib/lists";

export const metadata = { title: "Log Activity" };
export const dynamic = "force-dynamic";

export default async function LogActivityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  // The wizard only ever offers records from the city you're working in.
  const [accounts, contacts, leads, opportunities, events, campaigns, partners, locations, projects] = await Promise.all([
    db.query.accounts.findMany({ where: await cityWhere(s.accounts.cityId), orderBy: (a, { asc }) => [asc(a.name)] }),
    db.query.contacts.findMany({ where: await cityWhere(s.contacts.cityId), orderBy: (c, { asc }) => [asc(c.firstName)] }),
    db.query.leads.findMany({ where: await cityWhere(s.leads.cityId), orderBy: (l, { desc }) => [desc(l.createdAt)], limit: 500 }),
    db.query.opportunities.findMany({ where: await cityWhere(s.opportunities.cityId), orderBy: (o, { desc }) => [desc(o.createdAt)] }),
    db.query.events.findMany({ where: await cityWhere(s.events.cityId), orderBy: (e, { desc }) => [desc(e.startsAt)], limit: 40 }),
    db.query.campaigns.findMany({ where: await cityWhere(s.campaigns.cityId) }),
    db.query.partners.findMany({ where: await cityWhere(s.partners.cityId) }),
    db.query.locations.findMany({ where: await cityWhere(s.locations.cityId, eq(s.locations.active, true)) }),
    db.query.projects.findMany({ where: await cityWhere(s.projects.cityId), orderBy: (p, { desc }) => [desc(p.createdAt)] }),
  ]);

  const n = (k: string) => {
    const v = spStr(sp, k);
    return v ? Number(v) : undefined;
  };

  return (
    <ActivityWizard
      accounts={accounts.map((a) => ({
        id: a.id, name: a.name, status: a.status, relationship: a.relationshipStrength,
      }))}
      contacts={contacts.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim(), accountId: c.accountId, title: c.title }))}
      leads={leads.map((l) => ({
        id: l.id, name: `${l.firstName} ${l.lastName}`.trim(), phone: l.phone,
        apptStatus: l.apptStatus, interest: l.interestLevel,
      }))}
      opportunities={opportunities.map((o) => ({ id: o.id, name: o.name, accountId: o.accountId }))}
      events={events.map((e) => ({ id: e.id, name: e.name }))}
      campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
      partners={partners.map((p) => ({ id: p.id, accountId: p.accountId }))}
      locations={locations.map((l) => ({ id: l.id, name: l.name }))}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      prefill={{
        accountId: n("accountId"), contactId: n("contactId"), leadId: n("leadId"), opportunityId: n("opportunityId"),
        eventId: n("eventId"), partnerId: n("partnerId"), campaignId: n("campaignId"), projectId: n("projectId"),
        returnTo: spStr(sp, "returnTo"), type: spStr(sp, "type"),
      }}
    />
  );
}
