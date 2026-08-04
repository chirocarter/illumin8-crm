// "Today's Focus" — deterministic priority scoring. Plain rules, readable weights:
//   • Overdue tasks score highest, growing with days overdue
//   • Open opportunities with due/overdue follow-ups, weighted by stage
//   • Events happening in the next 3 days (prep) and event follow-ups due
//   • Drop box pickups that are due
//   • High-value verticals (gyms, dental, restaurants, wellness, corporate) get a boost
import { db, schema as s } from "@/db";
import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { HIGH_VALUE_VERTICALS, OPEN_STAGES } from "./taxonomy";
import { daysBetween, todayISO, addDays, fmtDate } from "./dates";
import { scopeConds } from "./scope";

export type FocusItem = {
  score: number;
  title: string;
  reason: string;
  href: string;
  kind: "task" | "opportunity" | "event" | "pickup";
  /**
   * What "Done" clears, when the item is something you can finish.
   *
   * Absent for the two kinds where it would destroy information rather than
   * record it: an upcoming-event reminder isn't a to-do (it drops off after the
   * date), and a drop box pickup has to capture how many cards you collected,
   * so it sends you to the partner page instead.
   */
  done?: { target: "task" | "opportunityFollowUp" | "eventFollowUp"; id: number };
};

const STAGE_WEIGHT: Record<string, number> = {
  "Event Booked": 14, "Event Date Pending": 20, "Proposal / Details Sent": 18,
  "Decision Maker Engaged": 16, Interested: 12, "Follow-Up Scheduled": 10,
  Contacted: 8, "First Contact Needed": 8, "Prospect Identified": 4, Nurture: 2,
};

/**
 * `scope` is the viewer's own work: their city and their records. This list is
 * a personal to-do queue, not a report — it never widens to another city or
 * another person's follow-ups.
 */
export async function todaysFocus(limit = 8, scope: { cityId?: number | null; userId?: number | null } = {}): Promise<FocusItem[]> {
  const today = todayISO();
  const soon = addDays(today, 3);
  const items: FocusItem[] = [];
  const mine = (t: Parameters<typeof scopeConds>[0]) => scopeConds(t, scope);

  // 1. Open tasks due today or overdue
  const tasks = await db
    .select({
      id: s.tasks.id, title: s.tasks.title, dueDate: s.tasks.dueDate,
      accountName: s.accounts.name, vertical: s.accounts.vertical,
    })
    .from(s.tasks)
    .leftJoin(s.accounts, eq(s.tasks.accountId, s.accounts.id))
    .where(and(eq(s.tasks.status, "Open"), isNotNull(s.tasks.dueDate), lte(s.tasks.dueDate, today), ...mine(s.tasks)));

  for (const t of tasks) {
    const overdueDays = t.dueDate ? daysBetween(t.dueDate, today) : 0;
    let score = overdueDays > 0 ? 50 + Math.min(overdueDays * 5, 30) : 45;
    if (t.vertical && (HIGH_VALUE_VERTICALS as readonly string[]).includes(t.vertical)) score += 6;
    items.push({
      score,
      title: t.title,
      reason: overdueDays > 0 ? `Overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}` : "Due today",
      // Opens the task itself (tasks have only an edit page), not the filtered list.
      href: `/tasks/${t.id}?from=home`,
      kind: "task",
      done: { target: "task", id: t.id },
    });
  }

  // 2. Open opportunities with follow-up due today or earlier
  const opps = await db
    .select({
      id: s.opportunities.id, name: s.opportunities.name, stage: s.opportunities.stage,
      nextStep: s.opportunities.nextStep,
      nextFollowUpAt: s.opportunities.nextFollowUpAt, vertical: s.accounts.vertical,
    })
    .from(s.opportunities)
    .leftJoin(s.accounts, eq(s.opportunities.accountId, s.accounts.id))
    .where(and(
      inArray(s.opportunities.stage, [...OPEN_STAGES]),
      isNotNull(s.opportunities.nextFollowUpAt),
      lte(s.opportunities.nextFollowUpAt, today),
      ...mine(s.opportunities),
    ));

  for (const o of opps) {
    const overdueDays = o.nextFollowUpAt ? daysBetween(o.nextFollowUpAt, today) : 0;
    let score = 34 + (STAGE_WEIGHT[o.stage] ?? 5) + Math.min(overdueDays * 3, 15);
    if (o.vertical && (HIGH_VALUE_VERTICALS as readonly string[]).includes(o.vertical)) score += 8;
    items.push({
      score,
      title: o.name,
      reason: `${o.stage} · ${o.nextStep ?? "follow-up due"}${overdueDays > 0 ? ` · ${overdueDays}d overdue` : ""}`,
      href: `/opportunities/${o.id}`,
      kind: "opportunity",
      done: { target: "opportunityFollowUp", id: o.id },
    });
  }

  // 3. Booked events starting in the next 3 days (prep) + event follow-ups due
  const upcoming = await db.query.events.findMany({
    where: and(
      inArray(s.events.status, ["Booked", "Confirmed"]),
      isNotNull(s.events.startsAt),
      lte(s.events.startsAt, soon + "T99"),
      ...mine(s.events),
    ),
  });
  for (const e of upcoming) {
    if (!e.startsAt || e.startsAt < today) continue;
    const inDays = daysBetween(today, e.startsAt);
    items.push({
      score: 62 - inDays * 6,
      title: `Prep: ${e.name}`,
      reason: inDays === 0 ? "Event is today" : `Event ${fmtDate(e.startsAt)} (${inDays}d out)`,
      href: `/events/${e.id}`,
      kind: "event",
    });
  }
  const eventFollowUps = await db.query.events.findMany({
    where: and(eq(s.events.followUpRequired, true), isNotNull(s.events.followUpDueAt), lte(s.events.followUpDueAt, addDays(today, 1)), ...mine(s.events)),
  });
  for (const e of eventFollowUps) {
    if (["Canceled", "Lost"].includes(e.status)) continue;
    items.push({
      score: 55,
      title: `Follow up: ${e.name}`,
      reason: `Post-event follow-up due ${fmtDate(e.followUpDueAt)}`,
      href: `/events/${e.id}`,
      kind: "event",
      done: { target: "eventFollowUp", id: e.id },
    });
  }

  // 4. Drop box pickups due
  // (Appointments are deliberately NOT surfaced here — Showed/No-Show is
  // tracked by the front desk, not the outreach role.)
  const pickups = await db
    .select({ id: s.partners.id, name: s.accounts.name, due: s.partners.nextPickupDueAt })
    .from(s.partners)
    .innerJoin(s.accounts, eq(s.partners.accountId, s.accounts.id))
    .where(and(eq(s.partners.dropBoxActive, true), isNotNull(s.partners.nextPickupDueAt), lte(s.partners.nextPickupDueAt, today), ...mine(s.partners)));
  for (const p of pickups) {
    const overdueDays = p.due ? daysBetween(p.due, today) : 0;
    items.push({
      score: 48 + Math.min(overdueDays * 4, 20),
      title: `Drop box pickup: ${p.name}`,
      reason: overdueDays > 0 ? `Pickup ${overdueDays}d overdue` : "Pickup due today",
      href: `/partners/${p.id}`,
      kind: "pickup",
    });
  }

  return items.sort((a, b) => b.score - a.score).slice(0, limit);
}
