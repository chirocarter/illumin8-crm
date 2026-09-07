import "server-only";

// Read-only account access for the AI outreach agent.
//
// Deliberately separate from lib/lists.ts. listAccounts() begins with
// scopeStart(), which reads the signed-in user's session and city cookie — an
// external agent has neither. Bending it to take an injected city would put a
// "whose scope is this?" branch inside the function every human list page
// depends on. This file instead takes cityId as a REQUIRED argument, so the
// type system makes an unscoped query impossible to write.
import { db, schema as s } from "@/db";
import { and, eq, like, or, sql, type SQL } from "drizzle-orm";

/** Never let one call walk the database. */
export const AGENT_SEARCH_MAX_LIMIT = 25;
export const AGENT_SEARCH_DEFAULT_LIMIT = 10;
/** Long enough to be a real query, short enough not to be an attack. */
export const AGENT_QUERY_MAX_LENGTH = 120;

/** The only account fields an agent has any reason to see when deduping. */
const SEARCH_FIELDS = {
  id: s.accounts.id,
  name: s.accounts.name,
  vertical: s.accounts.vertical,
  area: s.accounts.area,
  status: s.accounts.status,
  phone: s.accounts.phone,
  website: s.accounts.website,
  address: s.accounts.address,
} as const;

/** Digits only, last 10 — so "(505) 555-0142" and "+1 505-555-0142" match. */
export function phoneDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/**
 * Bare registrable-looking domain: protocol, www., path, port and query gone.
 * "https://www.Example.com/contact" and "example.com" both become example.com.
 */
export function normalizeDomain(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const domain = trimmed
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .split(":")[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null;
}

/** SQL that strips common phone punctuation so digits can be compared. */
function phoneDigitsSQL(col: typeof s.accounts.phone): SQL<string> {
  return sql<string>`replace(replace(replace(replace(replace(replace(coalesce(${col}, ''),
    '(', ''), ')', ''), '-', ''), ' ', ''), '.', ''), '+', '')`;
}

export type AgentSearchInput = {
  /** From the authenticated identity. Never from the request. */
  cityId: number;
  q?: string | null;
  phone?: string | null;
  website?: string | null;
  limit?: number | null;
};

export type AgentAccountMatch = {
  id: number; name: string; vertical: string; area: string;
  status: string; phone: string | null; website: string | null; address: string | null;
  /** Which supplied criterion this row matched — helps the agent judge a duplicate. */
  matchedOn: ("name" | "phone" | "website")[];
};

/**
 * Find businesses in ONE city that might already be this prospect.
 *
 * Criteria are OR'd: a phone match on a differently-spelled name is exactly the
 * duplicate worth catching. The caller decides what counts as a duplicate —
 * this only reports what exists.
 */
export async function searchAccountsForAgent(
  input: AgentSearchInput
): Promise<{ matches: AgentAccountMatch[]; limit: number; truncated: boolean }> {
  const limit = Math.min(
    Math.max(1, Math.floor(input.limit ?? AGENT_SEARCH_DEFAULT_LIMIT)),
    AGENT_SEARCH_MAX_LIMIT
  );

  const q = input.q?.trim().slice(0, AGENT_QUERY_MAX_LENGTH) || null;
  const digits = input.phone ? phoneDigits(input.phone.slice(0, AGENT_QUERY_MAX_LENGTH)) : null;
  const domain = input.website ? normalizeDomain(input.website.slice(0, AGENT_QUERY_MAX_LENGTH)) : null;

  const criteria: SQL[] = [];
  // LIKE with an escaped pattern: % and _ in a business name are literal here,
  // not wildcards the caller can use to widen the search to everything.
  if (q) {
    // "!" is the LIKE escape character, not backslash: a backslash has to
    // survive a TypeScript template literal AND SQLite's parser, and SQLite
    // rejected the result as not a single character. "!" needs no escaping in
    // either layer. % and _ in a business name stay literal, so a caller cannot
    // pass "%" to match the whole city.
    const safe = q.replace(/[!%_]/g, (c) => `!${c}`);
    criteria.push(sql`${s.accounts.name} LIKE ${"%" + safe + "%"} ESCAPE '!'`);
  }
  if (digits) criteria.push(sql`${phoneDigitsSQL(s.accounts.phone)} LIKE ${"%" + digits}`);
  if (domain) criteria.push(like(sql`lower(coalesce(${s.accounts.website}, ''))`, `%${domain}%`));

  // No criteria means no search. Returning the city's whole book on an empty
  // query would be exactly the "dump the database" call the cap exists to stop.
  if (criteria.length === 0) return { matches: [], limit, truncated: false };

  // cityId is not optional and not caller-supplied: this is the isolation.
  const rows = await db
    .select(SEARCH_FIELDS)
    .from(s.accounts)
    .where(and(eq(s.accounts.cityId, input.cityId), or(...criteria)!))
    .limit(limit + 1); // one extra, only to detect truncation

  const truncated = rows.length > limit;
  const page = truncated ? rows.slice(0, limit) : rows;

  // Domain confirmation happens here rather than in SQL: "%example.com%" would
  // also match notexample.com.au, and normalizing URLs properly in SQLite is
  // far more error-prone than doing it once in TypeScript.
  const matches: AgentAccountMatch[] = page.map((r) => {
    const matchedOn: AgentAccountMatch["matchedOn"] = [];
    if (q && r.name.toLowerCase().includes(q.toLowerCase())) matchedOn.push("name");
    if (digits && r.phone && phoneDigits(r.phone)?.endsWith(digits)) matchedOn.push("phone");
    if (domain && r.website && normalizeDomain(r.website) === domain) matchedOn.push("website");
    return { ...r, matchedOn };
  });

  return { matches, limit, truncated };
}

/** The fields an agent may see on one business, including its own prior research. */
export async function getAccountForAgent(cityId: number, id: number) {
  const row = await db.query.accounts.findFirst({
    where: and(eq(s.accounts.id, id), eq(s.accounts.cityId, cityId)),
    columns: {
      id: true, name: true, vertical: true, area: true, address: true,
      website: true, phone: true, email: true, status: true, source: true,
      ownerName: true, notes: true, relationshipStrength: true,
      partnershipScore: true, eventScore: true, doNotContact: true,
      lastContactedAt: true, nextFollowUpAt: true, partnerSince: true, createdAt: true,
      aiFitScore: true, aiResearch: true, agentRunId: true,
      aiReviewStatus: true, aiReviewReason: true,
      // cityId, userId and clinicLocationId are deliberately absent: internal
      // wiring the agent has no use for, and cityId in particular is the thing
      // it must never learn to think of as an input.
    },
  });
  if (!row) return null;

  // Stored as JSON text; handed back as an object so the agent doesn't have to
  // parse it. A malformed blob returns null rather than throwing.
  const { aiResearch, ...rest } = row;
  let research: unknown = null;
  if (aiResearch) { try { research = JSON.parse(aiResearch); } catch { research = null; } }
  return { ...rest, aiResearch: research };
}
