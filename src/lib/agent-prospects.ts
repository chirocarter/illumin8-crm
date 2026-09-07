import "server-only";

// Validation and duplicate safety for agent-written businesses.
//
// The agent is expected to search before it creates, but the server is the
// final word: relying on a caller to remember a check is not a safety layer.
import { db, schema as s } from "@/db";
import { and, eq, or, sql } from "drizzle-orm";
import { phoneDigits, normalizeDomain } from "./agent-accounts";

// ---- bounds on stored research -------------------------------------------
// SQLite is not a document store. These keep one business's research to a few
// kilobytes; anything larger belongs wherever the agent does its own logging.
export const MAX_SUMMARY_LENGTH = 2000;
export const MAX_SOURCES = 10;
export const MAX_URL_LENGTH = 500;
export const MAX_LABEL_LENGTH = 120;
export const MAX_RESEARCH_BYTES = 8000;
export const MAX_NAME_LENGTH = 200;
export const MAX_FIELD_LENGTH = 300;

export const RESEARCH_CONFIDENCE = ["low", "medium", "high"] as const;

export type ResearchPayload = {
  summary?: string;
  confidence?: string;
  sources?: { url: string; label?: string }[];
  researchedAt?: string;
  model?: string;
};

/**
 * Validate the research blob.
 *
 * Storage only — this deliberately knows nothing about how a score is reached
 * or what makes a business a fit. That reasoning lives in the future agent, not
 * in the CRM.
 */
export function validateResearch(raw: unknown): { ok: true; value: ResearchPayload } | { ok: false; error: string } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "aiResearch must be a JSON object" };
  }
  const r = raw as Record<string, unknown>;
  const out: ResearchPayload = {};

  if (r.summary !== undefined && r.summary !== null) {
    if (typeof r.summary !== "string") return { ok: false, error: "aiResearch.summary must be a string" };
    if (r.summary.length > MAX_SUMMARY_LENGTH) {
      return { ok: false, error: `aiResearch.summary exceeds ${MAX_SUMMARY_LENGTH} characters` };
    }
    out.summary = r.summary;
  }
  if (r.confidence !== undefined && r.confidence !== null) {
    if (typeof r.confidence !== "string" || !(RESEARCH_CONFIDENCE as readonly string[]).includes(r.confidence)) {
      return { ok: false, error: `aiResearch.confidence must be one of: ${RESEARCH_CONFIDENCE.join(", ")}` };
    }
    out.confidence = r.confidence;
  }
  if (r.sources !== undefined && r.sources !== null) {
    if (!Array.isArray(r.sources)) return { ok: false, error: "aiResearch.sources must be an array" };
    if (r.sources.length > MAX_SOURCES) {
      return { ok: false, error: `aiResearch.sources exceeds ${MAX_SOURCES} entries` };
    }
    const sources: { url: string; label?: string }[] = [];
    for (const [i, src] of r.sources.entries()) {
      if (src === null || typeof src !== "object" || Array.isArray(src)) {
        return { ok: false, error: `aiResearch.sources[${i}] must be an object` };
      }
      const sv = src as Record<string, unknown>;
      if (typeof sv.url !== "string" || !sv.url.trim()) {
        return { ok: false, error: `aiResearch.sources[${i}].url is required` };
      }
      if (sv.url.length > MAX_URL_LENGTH) {
        return { ok: false, error: `aiResearch.sources[${i}].url exceeds ${MAX_URL_LENGTH} characters` };
      }
      // http/https only: a stored javascript: or data: URL would eventually be
      // rendered as a link on the review screen.
      if (!/^https?:\/\//i.test(sv.url)) {
        return { ok: false, error: `aiResearch.sources[${i}].url must be http or https` };
      }
      const entry: { url: string; label?: string } = { url: sv.url };
      if (sv.label !== undefined && sv.label !== null) {
        if (typeof sv.label !== "string") return { ok: false, error: `aiResearch.sources[${i}].label must be a string` };
        if (sv.label.length > MAX_LABEL_LENGTH) {
          return { ok: false, error: `aiResearch.sources[${i}].label exceeds ${MAX_LABEL_LENGTH} characters` };
        }
        entry.label = sv.label;
      }
      sources.push(entry);
    }
    out.sources = sources;
  }
  for (const k of ["researchedAt", "model"] as const) {
    if (r[k] !== undefined && r[k] !== null) {
      if (typeof r[k] !== "string") return { ok: false, error: `aiResearch.${k} must be a string` };
      if ((r[k] as string).length > MAX_LABEL_LENGTH) {
        return { ok: false, error: `aiResearch.${k} exceeds ${MAX_LABEL_LENGTH} characters` };
      }
      out[k] = r[k] as string;
    }
  }

  const serialized = JSON.stringify(out);
  if (serialized.length > MAX_RESEARCH_BYTES) {
    return { ok: false, error: `aiResearch exceeds ${MAX_RESEARCH_BYTES} bytes when stored` };
  }
  return { ok: true, value: out };
}

export type DuplicateHit = { duplicateOf: number; matchedOn: ("phone" | "website")[] };

/**
 * Hard-stop duplicate check, within one city.
 *
 * Phone and domain only. A shared phone number or website is all but proof of
 * the same business; a shared NAME is not — "Anytime Fitness" is a hundred
 * businesses, and refusing on a name collision would block legitimate
 * franchises and common trading names. Name is reported as a soft signal
 * instead, for the eventual review screen.
 *
 * No fuzzy or vector matching: exact normalized equality only.
 */
export async function findDuplicate(
  cityId: number,
  input: { phone?: string | null; website?: string | null }
): Promise<DuplicateHit | null> {
  const digits = input.phone ? phoneDigits(input.phone) : null;
  const domain = input.website ? normalizeDomain(input.website) : null;
  if (!digits && !domain) return null;

  const criteria = [];
  if (digits) {
    criteria.push(sql`replace(replace(replace(replace(replace(replace(coalesce(${s.accounts.phone}, ''),
      '(', ''), ')', ''), '-', ''), ' ', ''), '.', ''), '+', '') LIKE ${"%" + digits}`);
  }
  if (domain) {
    criteria.push(sql`lower(coalesce(${s.accounts.website}, '')) LIKE ${"%" + domain + "%"}`);
  }

  const rows = await db
    .select({ id: s.accounts.id, phone: s.accounts.phone, website: s.accounts.website })
    .from(s.accounts)
    .where(and(eq(s.accounts.cityId, cityId), or(...criteria)!))
    .limit(20);

  for (const row of rows) {
    const matchedOn: ("phone" | "website")[] = [];
    if (digits && row.phone && phoneDigits(row.phone) === digits) matchedOn.push("phone");
    // Confirmed in TypeScript: the SQL LIKE would also match notexample.com.au.
    if (domain && row.website && normalizeDomain(row.website) === domain) matchedOn.push("website");
    if (matchedOn.length) return { duplicateOf: row.id, matchedOn };
  }
  return null;
}

/** Soft signal only — never blocks creation. Normalized exact name, same city. */
export async function findNameCollision(cityId: number, name: string): Promise<number | null> {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return null;
  const row = await db
    .select({ id: s.accounts.id })
    .from(s.accounts)
    .where(and(eq(s.accounts.cityId, cityId), sql`lower(trim(${s.accounts.name})) = ${normalized}`))
    .limit(1);
  return row[0]?.id ?? null;
}
