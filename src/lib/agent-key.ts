// Credential generation + hashing for agent identities.
//
// Deliberately free of `server-only` and of any database import, so the
// provisioning script (a plain tsx process) can use it. Same reason
// lib/followups.ts exists apart from lib/metrics.ts.
import { createHmac, randomBytes } from "crypto";

/**
 * Secret used to HMAC bearer credentials before storing or comparing them.
 *
 * NOT SESSION_SECRET: rotating that would sign every user out, and coupling
 * the agent's credentials to it would break the integration at the same
 * moment. Kept separate so the two rotate independently.
 *
 * Set AGENT_KEY_SECRET in .env.local (local) and Vercel env vars (production).
 * There is no fallback on purpose — a default would let anyone who reads this
 * repo forge a credential. Missing secret = agent auth fails closed.
 */
export function agentKeySecret(): string | null {
  const secret = process.env.AGENT_KEY_SECRET;
  return secret && secret.length >= 16 ? secret : null;
}

/** Bearer credentials carry a prefix so they're identifiable in a log or leak scan. */
export const AGENT_KEY_PREFIX = "i8a_";

/**
 * A new bearer credential: 32 random bytes, ~256 bits of entropy.
 * Returned once at provisioning and never recoverable afterwards.
 */
export function generateAgentKey(): string {
  return AGENT_KEY_PREFIX + randomBytes(32).toString("base64url");
}

/**
 * Deterministic digest of a credential.
 *
 * HMAC-SHA256 rather than the salted scrypt used for passwords, because a
 * bearer token has to be looked UP by value and scrypt cannot be queried.
 * Safe here in a way it would not be for passwords: these are 256-bit random
 * strings, so there is no dictionary to attack — and without AGENT_KEY_SECRET
 * a stolen database yields no usable credential.
 */
export function hashAgentKey(rawKey: string): string | null {
  const secret = agentKeySecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(rawKey).digest("hex");
}
