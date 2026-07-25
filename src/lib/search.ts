// One search implementation for everything: the typeahead dropdown, the
// /search page, and the /api/search endpoint all call this — same query,
// same results, no drift.
import { db, schema as s } from "@/db";
import { and, eq, like, or, type SQL } from "drizzle-orm";
import { activeCityId } from "./scope";

export const SEARCH_GROUPS = [
  "Businesses", "Contacts", "Leads", "Opportunities", "Events", "Partners", "Campaigns",
] as const;
export type SearchGroup = (typeof SEARCH_GROUPS)[number];

export type SearchHit = {
  kind: SearchGroup;
  label: string;
  sub: string | null;
  badge: string | null;
  href: string;
};

export async function globalSearch(q: string, limitPerGroup = 5): Promise<SearchHit[]> {
  const term = `%${q.trim()}%`;
  // Search only the city you're working in — the other market's records are
  // never what you're reaching for mid-task.
  const city = await activeCityId();
  const inCity = (col: SQL | ReturnType<typeof like>, cityCol: Parameters<typeof eq>[0]) =>
    city ? and(col, eq(cityCol, city)) : col;

  const [accounts, contacts, leads, opportunities, events, partners, campaigns] = await Promise.all([
    db.query.accounts.findMany({ where: inCity(like(s.accounts.name, term), s.accounts.cityId), limit: limitPerGroup }),
    db.query.contacts.findMany({
      where: inCity(or(like(s.contacts.firstName, term), like(s.contacts.lastName, term), like(s.contacts.email, term))!, s.contacts.cityId),
      limit: limitPerGroup,
    }),
    db.query.leads.findMany({
      where: inCity(or(like(s.leads.firstName, term), like(s.leads.lastName, term), like(s.leads.phone, term))!, s.leads.cityId),
      limit: limitPerGroup,
    }),
    db.query.opportunities.findMany({ where: inCity(like(s.opportunities.name, term), s.opportunities.cityId), limit: limitPerGroup }),
    db.query.events.findMany({ where: inCity(like(s.events.name, term), s.events.cityId), limit: limitPerGroup }),
    db.select({ id: s.partners.id, name: s.accounts.name, type: s.partners.partnerType, status: s.partners.status })
      .from(s.partners).innerJoin(s.accounts, eq(s.partners.accountId, s.accounts.id))
      .where(inCity(like(s.accounts.name, term), s.partners.cityId)).limit(limitPerGroup),
    db.query.campaigns.findMany({ where: inCity(like(s.campaigns.name, term), s.campaigns.cityId), limit: limitPerGroup }),
  ]);

  return [
    ...accounts.map((a): SearchHit => ({
      kind: "Businesses", label: a.name, sub: `${a.vertical} · ${a.area}`, badge: a.status, href: `/accounts/${a.id}`,
    })),
    ...contacts.map((c): SearchHit => ({
      kind: "Contacts", label: `${c.firstName} ${c.lastName}`.trim(), sub: c.title ?? c.contactType, badge: null, href: `/contacts/${c.id}`,
    })),
    ...leads.map((l): SearchHit => ({
      kind: "Leads", label: `${l.firstName} ${l.lastName}`.trim(), sub: l.phone, badge: l.apptStatus, href: `/leads/${l.id}`,
    })),
    ...opportunities.map((o): SearchHit => ({
      kind: "Opportunities", label: o.name, sub: o.type, badge: o.stage, href: `/opportunities/${o.id}`,
    })),
    ...events.map((e): SearchHit => ({
      kind: "Events", label: e.name, sub: e.type, badge: e.status, href: `/events/${e.id}`,
    })),
    ...partners.map((p): SearchHit => ({
      kind: "Partners", label: p.name, sub: p.type, badge: p.status, href: `/partners/${p.id}`,
    })),
    ...campaigns.map((c): SearchHit => ({
      kind: "Campaigns", label: c.name, sub: c.type, badge: c.status, href: `/campaigns/${c.id}`,
    })),
  ];
}
