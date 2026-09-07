// Which accounts count as real outreach work.
//
// An AI-created prospect is a candidate, not a prospect someone is working.
// Until a human approves it, it must not inflate the numbers that describe what
// the team did — but it must still be visible in the CRM, or it could never be
// reviewed.
//
// No `server-only`: pipeline.ts deliberately avoids that marker so plain scripts
// can import it, and this has to be usable from both.
import { schema as s } from "@/db";
import { or, isNull, eq, type SQL } from "drizzle-orm";

/** Written by the agent on creation. Cleared or advanced by a human. */
export const AI_REVIEW_PENDING = "Pending";
export const AI_REVIEW_APPROVED = "Approved";
export const AI_REVIEW_REJECTED = "Rejected";

/** `source` value stamped on every agent-created business. */
export const AI_AGENT_SOURCE = "AI Agent";

/**
 * Accounts that belong in normal outreach metrics.
 *
 * Written as an allow-list — NULL (human-entered) or explicitly Approved —
 * rather than "not Pending". Same behaviour today, since Pending is the only
 * value the agent writes, but it means a Rejected prospect stays out the moment
 * rejection exists, instead of silently re-entering the numbers because nobody
 * remembered to extend a deny-list.
 *
 * Applied in exactly two places, both identified by audit:
 *   • metrics.ts   businesses_added
 *   • pipeline.ts  the pipeline board
 *
 * Deliberately NOT applied to the accounts list page (a pending prospect has to
 * be visible to be reviewed) or to CSV-import dedupe (it should still block a
 * re-import).
 */
export function humanCountableAccounts(): SQL {
  return or(
    isNull(s.accounts.aiReviewStatus),
    eq(s.accounts.aiReviewStatus, AI_REVIEW_APPROVED)
  )!;
}
