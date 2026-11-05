export const MAX_BUSINESS_CONTACT_FIELD_LENGTH = 300;

export type BusinessResearchContact = {
  name?: string;
  title?: string;
  phone?: string;
  email?: string;
  address?: string;
};

export type BusinessContactFields = {
  address?: string;
  phone?: string;
  email?: string;
  ownerName?: string;
};

type ContactValidation =
  | { ok: true; value: BusinessResearchContact }
  | { ok: false; error: string };

export function validateBusinessResearchContact(raw: unknown): ContactValidation {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "aiResearch.contact must be a JSON object" };
  }

  const input = raw as Record<string, unknown>;
  const contact: BusinessResearchContact = {};
  for (const key of ["name", "title", "phone", "email", "address"] as const) {
    const value = input[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string") {
      return { ok: false, error: `aiResearch.contact.${key} must be a string` };
    }
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_BUSINESS_CONTACT_FIELD_LENGTH) {
      return {
        ok: false,
        error: `aiResearch.contact.${key} exceeds ${MAX_BUSINESS_CONTACT_FIELD_LENGTH} characters`,
      };
    }
    contact[key] = trimmed;
  }
  return { ok: true, value: contact };
}

/**
 * The structured research contact is a fallback for account fields. This makes
 * one verified value useful in both the review narrative and the CRM without
 * forcing a Make scenario to duplicate every mapping.
 */
export function mergeBusinessContactFields(
  explicit: BusinessContactFields,
  researchContact?: BusinessResearchContact,
): BusinessContactFields {
  const derivedOwner = [researchContact?.name, researchContact?.title]
    .filter((value): value is string => Boolean(value))
    .join(" — ");

  return {
    address: explicit.address || researchContact?.address,
    phone: explicit.phone || researchContact?.phone,
    email: explicit.email || researchContact?.email,
    ownerName: explicit.ownerName || derivedOwner || undefined,
  };
}

type ClaimCheck = { ok: true } | { ok: false; error: string };

const ACTUAL_EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const ACTUAL_PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;

const EMAIL_CLAIM = /\b(?:with (?:an? )?email|(?:verified|credible|public|published|listed|direct|usable|available) email|email (?:address )?(?:found|listed|published|provided|available))\b/i;
const PHONE_CLAIM = /\b(?:with (?:a )?phone|(?:verified|credible|public|published|listed|direct|usable|available) (?:phone|phone number)|phone (?:number )?(?:found|listed|published|provided|available))\b/i;
const ADDRESS_CLAIM = /\b(?:(?:verified|public|published|listed|provided|concrete) (?:local |office |street )?address|street address (?:found|listed|published|provided|available))\b/i;
const EMAIL_NEGATION = /\b(?:no|without) (?:public )?email\b|\bemail(?: address)? (?:is |was )?(?:unknown|unavailable|missing|not found|masked|omitted)\b/i;
const PHONE_NEGATION = /\b(?:no|without) (?:public )?(?:phone|phone number)\b|\bphone(?: number)? (?:is |was )?(?:unknown|unavailable|missing|not found|masked|omitted)\b/i;
const ADDRESS_NEGATION = /\b(?:no|without) (?:public )?(?:address|street address)\b|\baddress (?:is |was )?(?:unknown|unavailable|missing|not found|masked|omitted)\b/i;

/**
 * Stop prose-only contact claims at the API boundary. The patterns stay narrow:
 * they catch an actual value or an affirmative phrase such as "with email",
 * while ordinary statements about unknown or missing contact data pass.
 */
export function validateBusinessContactClaims(
  summary: string | undefined,
  fields: BusinessContactFields,
): ClaimCheck {
  if (!summary) return { ok: true };

  if ((ACTUAL_EMAIL.test(summary) || (EMAIL_CLAIM.test(summary) && !EMAIL_NEGATION.test(summary))) && !fields.email) {
    return {
      ok: false,
      error: "aiResearch.summary claims an email was found, but no structured email was provided",
    };
  }
  if ((ACTUAL_PHONE.test(summary) || (PHONE_CLAIM.test(summary) && !PHONE_NEGATION.test(summary))) && !fields.phone) {
    return {
      ok: false,
      error: "aiResearch.summary claims a phone was found, but no structured phone was provided",
    };
  }
  if (ADDRESS_CLAIM.test(summary) && !ADDRESS_NEGATION.test(summary) && !fields.address) {
    return {
      ok: false,
      error: "aiResearch.summary claims an address was found, but no structured address was provided",
    };
  }
  return { ok: true };
}

