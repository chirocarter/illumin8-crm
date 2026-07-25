import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const SECRET = process.env.SESSION_SECRET ?? "illumin8-dev-secret-change-me";
export const SESSION_COOKIE = "i8_session";
const SESSION_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function createSessionToken(email: string): string {
  const expires = Date.now() + SESSION_DAYS * 86400000;
  const payload = Buffer.from(`${email}|${expires}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): { email: string } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || sign(payload) !== sig) return null;
  const [email, expires] = Buffer.from(payload, "base64url").toString().split("|");
  if (!email || Number(expires) < Date.now()) return null;
  return { email };
}

export async function getSessionUser() {
  const store = await cookies();
  const session = verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, session.email) });
  return user ?? null;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/settings?error=admin");
  return user;
}
