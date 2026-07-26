// City + ownership scoping.
//
// Two different questions, deliberately kept apart:
//
//  1. "Which city am I working in?" — the WORKFLOW scope. Every list, picker
//     and drill-down is pinned to exactly one city so another market's leads
//     never show up mid-task. Admins switch it; members are locked to theirs.
//
//  2. "Whose numbers am I looking at?" — the STATS scope. Only the Command
//     Center and the Performance Report offer this, and it can widen to the
//     whole organization or narrow to one person.
import "server-only";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { db, schema as s } from "@/db";
import { and, asc, eq, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { getSessionUser } from "./auth";

// Declared here rather than imported from ./lists so the dependency runs one
// way only: lists depends on scope, never the reverse.
type SP = Record<string, string | string[] | undefined>;

export const CITY_COOKIE = "i8_city";

export type City = { id: number; name: string };

export async function allCities(): Promise<City[]> {
  return db
    .select({ id: s.cities.id, name: s.cities.name })
    .from(s.cities)
    .where(eq(s.cities.active, true))
    .orderBy(asc(s.cities.name));
}

/**
 * The one city the signed-in user is currently working in.
 * Admins may point the `i8_city` cookie at any active city; everyone else is
 * pinned to the city on their user record. Falls back to the first city so the
 * app still works if an assignment is missing.
 */
export async function activeCity(): Promise<City | null> {
  const [cities, user] = await Promise.all([allCities(), getSessionUser()]);
  if (cities.length === 0) return null;
  const find = (id: number | null | undefined) => cities.find((c) => c.id === id);

  if (user?.role === "admin") {
    const cookieCity = Number((await cookies()).get(CITY_COOKIE)?.value);
    return find(cookieCity) ?? find(user.cityId) ?? cities[0];
  }
  return find(user?.cityId) ?? cities[0];
}

export async function activeCityId(): Promise<number | null> {
  return (await activeCity())?.id ?? null;
}

// ---------- Stats scope (Command Center + Performance Report) ----------

export type ScopeMode = "org" | "city" | "person";

export type StatScope = {
  mode: ScopeMode;
  cityId: number | null; // null = every city
  userId: number | null; // null = everyone
  label: string;         // e.g. "Albuquerque" / "All cities" / "Carter"
  /** URL params to carry this scope into drill-down links. */
  params: { scope?: string; who?: string };
};

/**
 * Resolve the stats scope from the URL, clamped to what the viewer may see.
 * Members can look at themselves or their own city — never org-wide, never
 * another individual.
 */
export async function resolveScope(sp: SP): Promise<StatScope> {
  const user = await getSessionUser();
  const isAdmin = user?.role === "admin";
  const city = await activeCity();

  const raw = Array.isArray(sp.scope) ? sp.scope[0] : sp.scope;
  const whoRaw = Number(Array.isArray(sp.who) ? sp.who[0] : sp.who);
  let mode: ScopeMode = raw === "org" || raw === "person" ? raw : "city";
  if (mode === "org" && !isAdmin) mode = "city";

  if (mode === "person") {
    const who = isAdmin && Number.isFinite(whoRaw) && whoRaw > 0 ? whoRaw : (user?.id ?? null);
    const person = who ? await db.query.users.findFirst({ where: eq(s.users.id, who) }) : null;
    return {
      mode, cityId: null, userId: who,
      label: person?.name ?? "Me",
      params: { scope: "person", who: who && who !== user?.id ? String(who) : undefined },
    };
  }
  if (mode === "org") {
    return { mode, cityId: null, userId: null, label: "All cities", params: { scope: "org" } };
  }
  return { mode, cityId: city?.id ?? null, userId: null, label: city?.name ?? "My city", params: {} };
}

/** People whose stats the viewer may switch to (admins only). */
export async function selectableUsers() {
  const user = await getSessionUser();
  if (user?.role !== "admin") return [];
  return db
    .select({ id: s.users.id, name: s.users.name, cityId: s.users.cityId })
    .from(s.users)
    .orderBy(asc(s.users.name));
}

// ---------- Applying a scope to a query ----------

type Owned = { cityId: SQLiteColumn; userId: SQLiteColumn };

/**
 * Conditions that narrow any owned table to a scope. Spread into `and(...)`:
 *   and(dateRange, ...scopeConds(s.activities, scope))
 */
/**
 * A `where` clause pinned to the active city, for the pickers and calendars
 * that query a table directly instead of going through ./lists.
 *   where: await cityWhere(s.accounts.cityId)
 */
export async function cityWhere(col: SQLiteColumn, ...extra: (SQL | undefined)[]): Promise<SQL | undefined> {
  const city = await activeCityId();
  const conds = [...extra, ...(city ? [eq(col, city)] : [])].filter(Boolean) as SQL[];
  return conds.length ? and(...conds) : undefined;
}

export function scopeConds(t: Owned, scope?: { cityId?: number | null; userId?: number | null }): SQL[] {
  const conds: SQL[] = [];
  if (scope?.cityId) conds.push(eq(t.cityId, scope.cityId));
  if (scope?.userId) conds.push(eq(t.userId, scope.userId));
  return conds;
}

// ---------- Record-level authorization ----------

/**
 * May the signed-in user touch this record? Guards against IDOR: without it,
 * any authenticated user could read or overwrite another city's records just by
 * changing the id in a URL. Filtering a query by id alone is authentication,
 * not authorization — this supplies the missing half.
 *
 * Rules: admins reach every city; members are confined to their own. Records
 * predating the city columns (cityId null) stay reachable so nothing 404s.
 */
export async function canAccessCity(cityId: number | null | undefined): Promise<boolean> {
  const user = await getSessionUser();
  if (!user) return false;
  if (user.role === "admin") return true;
  if (cityId == null) return true;
  return cityId === user.cityId;
}

/**
 * Returns the record if the viewer may see it, otherwise triggers a 404 —
 * deliberately indistinguishable from "doesn't exist", so probing ids can't be
 * used to enumerate what lives in another city.
 *
 *   const account = await authorize(await db.query.accounts.findFirst(...));
 */
export async function authorize<T extends { cityId?: number | null } | undefined>(record: T): Promise<NonNullable<T>> {
  if (!record) notFound();
  if (!(await canAccessCity(record.cityId))) notFound();
  return record as NonNullable<T>;
}

/**
 * The workflow scope for list pages: the active city, unless a drill-down link
 * explicitly widened it (admins only). `who` narrows to one person's records so
 * a per-person metric opens exactly the rows behind it.
 */
export async function listScope(sp: SP): Promise<{ cityId: number | null; userId: number | null }> {
  const user = await getSessionUser();
  const isAdmin = user?.role === "admin";
  const raw = Array.isArray(sp.scope) ? sp.scope[0] : sp.scope;
  const whoRaw = Number(Array.isArray(sp.who) ? sp.who[0] : sp.who);

  const orgWide = raw === "org" && isAdmin;
  const person = raw === "person";
  const userId = person ? (isAdmin && Number.isFinite(whoRaw) && whoRaw > 0 ? whoRaw : user?.id ?? null) : null;

  return {
    // A person's records may live in any city, so a person drill-down isn't
    // re-narrowed by city — the user filter is already the tighter one.
    cityId: orgWide || person ? null : await activeCityId(),
    userId,
  };
}
