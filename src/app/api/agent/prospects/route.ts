import { NextRequest } from "next/server";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { authenticateAgent, agentAuthError } from "@/lib/agent-auth";
import { loadOwnedRun, runUsage, MAX_ACTIVITIES_PER_RUN, STALE_RUN_HOURS } from "@/lib/agent-runs";
import {
  findDuplicate, findNameCollision, validateResearch,
  MAX_NAME_LENGTH, MAX_FIELD_LENGTH,
} from "@/lib/agent-prospects";
import { AI_REVIEW_PENDING, AI_AGENT_SOURCE } from "@/lib/ai-review";
import { formatPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/prospects — create a candidate business for human review.
 *
 * ON ATOMICITY, deliberately not glossed over: this does NOT use a database
 * transaction. The app's two drivers disagree about what one means — the local
 * better-sqlite3 handle is cast to the libsql type, and its transaction API is
 * synchronous, so an async callback commits before a thrown error can roll
 * anything back (verified: a forced failure left the row behind). Production's
 * libsql driver is genuinely async. Relying on transactions would therefore be
 * atomic in production and silently not atomic locally, so a rollback bug could
 * never reproduce on a developer machine.
 *
 * Instead: insert the account, then the ledger entry, and if the ledger entry
 * fails, delete the account we just made. Same behaviour on both drivers. The
 * residual risk is a crash between the two writes, which is detectable with one
 * query — an account with agent_run_id and no matching 'created' activity.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateAgent(req);
  if (!auth.ok) return agentAuthError(auth);

  let body: unknown;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Malformed JSON body" }, { status: 400 }); }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Body must be a JSON object" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  if (typeof b.agentRunId !== "number" || !Number.isInteger(b.agentRunId) || b.agentRunId <= 0) {
    return Response.json({ error: '"agentRunId" is required' }, { status: 400 });
  }
  if (typeof b.name !== "string" || !b.name.trim()) {
    return Response.json({ error: '"name" is required' }, { status: 400 });
  }
  const name = b.name.trim();
  if (name.length > MAX_NAME_LENGTH) {
    return Response.json({ error: `"name" exceeds ${MAX_NAME_LENGTH} characters` }, { status: 400 });
  }

  // Optional descriptive fields. Anything not in this list is ignored rather
  // than written — notably status, cityId, userId and every review field.
  const text = (k: string): string | null | undefined => {
    const v = b[k];
    if (v === undefined || v === null) return undefined;
    if (typeof v !== "string") return null;
    return v.trim().slice(0, MAX_FIELD_LENGTH) || undefined;
  };
  const fields: Record<string, string | undefined> = {};
  for (const k of ["vertical", "area", "address", "phone", "email", "website"]) {
    const v = text(k);
    if (v === null) return Response.json({ error: `"${k}" must be a string` }, { status: 400 });
    if (v !== undefined) fields[k] = v;
  }

  let fitScore: number | null = null;
  if (b.aiFitScore !== undefined && b.aiFitScore !== null) {
    if (typeof b.aiFitScore !== "number" || !Number.isInteger(b.aiFitScore) || b.aiFitScore < 0 || b.aiFitScore > 100) {
      return Response.json({ error: '"aiFitScore" must be an integer 0-100' }, { status: 400 });
    }
    fitScore = b.aiFitScore;
  }

  let researchJson: string | null = null;
  if (b.aiResearch !== undefined && b.aiResearch !== null) {
    const parsed = validateResearch(b.aiResearch);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    researchJson = JSON.stringify(parsed.value);
  }

  // The run must exist, be owned by this agent AND city, and still be running.
  const lookup = await loadOwnedRun(b.agentRunId, auth.agent, { mustBeRunning: true });
  if (!lookup.ok) {
    if (lookup.reason === "not_found") return Response.json({ error: "Not found" }, { status: 404 });
    if (lookup.reason === "terminal") {
      return Response.json({ error: "Run is already complete; its ledger is immutable" }, { status: 409 });
    }
    return Response.json(
      { error: `Run has been open longer than ${STALE_RUN_HOURS}h and no longer accepts activity` },
      { status: 409 }
    );
  }
  const run = lookup.run;

  // A prospect writes a ledger row, so it is bound by the same run cap.
  const usage = await runUsage(run.id);
  if (usage.total + 1 > MAX_ACTIVITIES_PER_RUN) {
    return Response.json({ error: `Run would exceed ${MAX_ACTIVITIES_PER_RUN} activities` }, { status: 409 });
  }

  // Server-side duplicate safety, within this city only. The agent is expected
  // to have searched; this is what makes it true whether or not it did.
  const dup = await findDuplicate(auth.agent.cityId, { phone: fields.phone, website: fields.website });
  if (dup) {
    await db.insert(s.agentActivities).values({
      agentRunId: run.id,
      accountId: dup.duplicateOf,
      action: "duplicate_skipped",
      detail: `"${name}" matched an existing business on ${dup.matchedOn.join(" and ")}`.slice(0, 500),
      cityId: run.cityId,
    });
    return Response.json(
      { created: false, duplicateOf: dup.duplicateOf, matchedOn: dup.matchedOn },
      { status: 409 }
    );
  }

  // A name collision is reported, never enforced: "Anytime Fitness" is a
  // hundred different businesses, and refusing on a name would block real ones.
  const nameCollision = await findNameCollision(auth.agent.cityId, name);
  const certainty = fields.phone || fields.website ? "high" : "low";

  const [account] = await db.insert(s.accounts).values({
    name,
    vertical: fields.vertical ?? "Other",
    area: fields.area ?? "Other",
    address: fields.address ?? null,
    phone: formatPhone(fields.phone ?? null),
    email: fields.email ?? null,
    website: fields.website ?? null,
    // status stays at the schema default ("New Prospect"). The review state
    // lives in aiReviewStatus, deliberately not overloaded onto status.
    source: AI_AGENT_SOURCE,
    aiFitScore: fitScore,
    aiResearch: researchJson,
    agentRunId: run.id,
    aiReviewStatus: AI_REVIEW_PENDING,
    cityId: run.cityId,   // from the run, which came from the credential
    userId: run.userId,   // ditto
  }).returning();

  try {
    await db.insert(s.agentActivities).values({
      agentRunId: run.id,
      accountId: account.id,
      action: "created",
      detail: `Created "${name}" for review`.slice(0, 500),
      cityId: run.cityId,
    });
  } catch (err) {
    // Compensating delete: the ledger must never miss a real write, so if it
    // cannot be recorded, the write is undone rather than left unaudited.
    await db.delete(s.accounts).where(eq(s.accounts.id, account.id));
    console.error("[agent] ledger write failed; prospect rolled back", err);
    return Response.json({ error: "Could not record the audit entry; nothing was created" }, { status: 500 });
  }

  return Response.json({
    created: true,
    id: account.id,
    name: account.name,
    city: auth.agent.cityName,
    aiReviewStatus: account.aiReviewStatus,
    source: account.source,
    duplicateCertainty: certainty,
    ...(nameCollision ? { nameCollisionWith: nameCollision } : {}),
  }, { status: 201 });
}
