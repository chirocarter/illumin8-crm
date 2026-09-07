"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { createSessionToken, verifyPassword, SESSION_COOKIE } from "@/lib/auth";
import { AGENT_ROLE } from "@/lib/taxonomy";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  // An agent identity may never hold a CRM session. Its stored password hash is
  // already unusable, so this is the second of two locks rather than the only
  // one — but it states the rule where someone reading the login flow will see
  // it, instead of leaving it implicit in the shape of a hash.
  if (!user || user.role === AGENT_ROLE || !verifyPassword(password, user.passwordHash)) {
    redirect("/login?error=1");
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(user.email), {
    httpOnly: true,
    // HTTPS-only in production so the session can't ride an insecure request.
    // Off in dev, where localhost is plain http.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86400,
  });
  redirect("/");
}
