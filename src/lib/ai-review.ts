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

/**
 * Events that belong on a human's normal operational surfaces.
 *
 * Same allow-list shape as the account gate, and the same reasoning: NULL means
 * a person entered it, Approved means a person let it in. Pending and Rejected
 * are both excluded, so a rejected event stays out without anyone remembering
 * to extend a deny-list.
 *
 * This is a REVIEW test, not a lifecycle test. It says nothing about Idea vs
 * Booked vs Completed — an Approved event is still 'Idea' until a person moves
 * it, and that is a separate question this function must never confuse itself
 * with.
 *
 * Applied to the surfaces an audit identified as leaking:
 *   • calendar          a Pending candidate looked like a real commitment
 *   • events list       the default/"All" view
 *   • global search
 *   • CSV export        (through listEvents)
 *   • pipeline          defensively; Idea status already keeps them off
 *
 * Deliberately NOT applied to the booked/held/screening metrics. Those are safe
 * by construction — an agent event has no bookedAt and is never Completed — and
 * adding a filter for symmetry would imply the numbers had been at risk.
 */
export function humanCountableEvents(): SQL {
  return or(
    isNull(s.events.aiReviewStatus),
    eq(s.events.aiReviewStatus, AI_REVIEW_APPROVED)
  )!;
}
