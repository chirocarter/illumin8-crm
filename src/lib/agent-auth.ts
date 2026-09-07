import "server-only";

// Authentication for the external AI outreach agent.
//
// ONE shared system, one agent IDENTITY PER CITY. "Illumin8 AI — Albuquerque"
// and "Illumin8 AI — McKinney" are two rows in `users`, each with its own
// bearer credential and its own cityId.
//
// The architectural rule this file exists to enforce:
//
//   The city comes from the credential, never from the request.
//
// A handler asks authenticateAgent() who is calling and gets back a cityId it
// must use. No endpoint accepts a cityId, so there is no input an agent could
// change to reach another market's records — isolation is a property of the
// identity, not of a check someone has to remember to write.
import { timingSafeEqual } from "crypto";
import { db, schema as s } from "@/db";
import { and, eq } from "drizzle-orm";
import { AGENT_ROLE } from "./taxonomy";
import { agentKeySecret, hashAgentKey, AGENT_KEY_PREFIX } from "./agent-key";

// Credential generation and hashing live in ./agent-key, which carries no
// `server-only` marker so the provisioning script can import it too.
export { generateAgentKey, hashAgentKey } from "./agent-key";

/** The trusted identity a handler may act on. Never built from request input. */
export type AgentIdentity = {
  userId: number;
  cityId: number;
  userName: string;
  cityName: string;
};

export type AgentAuthResult =
  | { ok: true; agent: AgentIdentity }
  | { ok: false; status: 401 | 403 | 500; error: string };

/** Extracts the credential from an `Authorization: Bearer …` header. */
function bearerFrom(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, ...rest] = header.trim().split(/\s+/);
  if (!/^bearer$/i.test(scheme)) return null;
  const token = rest.join("");
  return token.length > 0 ? token : null;
}

/**
 * Resolve an incoming request to exactly one agent identity.
 *
 * Every /api/agent route MUST start with this. Those routes are exempt from the
 * session middleware, so this function — not the middleware — is the only thing
 * standing in front of them.
 */
export async function authenticateAgent(req: Request): Promise<AgentAuthResult> {
  if (!agentKeySecret()) {
    // Fail closed and say nothing useful to the caller about why.
    console.error("[agent-auth] AGENT_KEY_SECRET is unset or too short — agent auth disabled");
    return { ok: false, status: 500, error: "Agent authentication is not configured" };
  }

  const raw = bearerFrom(req);
  if (!raw) return { ok: false, status: 401, error: "Missing or malformed Authorization header" };
  if (!raw.startsWith(AGENT_KEY_PREFIX) || raw.length < AGENT_KEY_PREFIX.length + 20) {
    return { ok: false, status: 401, error: "Invalid credential" };
  }

  const hash = hashAgentKey(raw);
  if (!hash) return { ok: false, status: 500, error: "Agent authentication is not configured" };

  // role is part of the WHERE clause, so a human user's row can never match
  // even if one somehow carried a key hash.
  const user = await db.query.users.findFirst({
    where: and(eq(s.users.agentKeyHash, hash), eq(s.users.role, AGENT_ROLE)),
  });
  if (!user) return { ok: false, status: 401, error: "Invalid credential" };

  // Belt and braces: re-compare in constant time. The SQL lookup above already
  // matched on a full-length digest, but this makes the comparison explicit
  // rather than relying on the database engine's behaviour.
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(user.agentKeyHash ?? "", "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: "Invalid credential" };
  }

  // An agent with no city could not be scoped, so it is refused outright
  // rather than silently defaulting to a market.
  if (user.cityId == null) {
    return { ok: false, status: 403, error: "Agent identity has no city assigned" };
  }
  const city = await db.query.cities.findFirst({ where: eq(s.cities.id, user.cityId) });
  if (!city) return { ok: false, status: 403, error: "Agent identity has no city assigned" };
  if (!city.active) return { ok: false, status: 403, error: "Agent's city is inactive" };

  return {
    ok: true,
    agent: { userId: user.id, cityId: city.id, userName: user.name, cityName: city.name },
  };
}

/** Standard JSON error response for a failed agent authentication. */
export function agentAuthError(result: Extract<AgentAuthResult, { ok: false }>): Response {
  return Response.json({ error: result.error }, { status: result.status });
}
