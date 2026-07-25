// Deterministic housekeeping, run when the Command Center loads:
// any Booked/Confirmed event whose date has passed gets an "Enter outcomes"
// task (once — idempotent by event + title), so results never slip through.
// Appointments get NO such nudges: Showed / No-Show is tracked by the front
// desk, not the outreach role — statuses here update whenever they're known.
import { db, schema as s } from "@/db";
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import { nowISO, todayISO } from "./dates";

export async function ensureFollowUpTasks() {
  const pastEvents = await db.query.events.findMany({
    where: and(
      inArray(s.events.status, ["Booked", "Confirmed"]),
      isNotNull(s.events.startsAt),
      lt(s.events.startsAt, nowISO()),
    ),
  });

  for (const event of pastEvents) {
    const title = `Enter outcomes: ${event.name}`;
    const existing = await db.query.tasks.findFirst({
      where: and(eq(s.tasks.eventId, event.id), eq(s.tasks.title, title)),
    });
    if (existing) continue; // already created (open or done) — never nag twice
    await db.insert(s.tasks).values({
      title,
      dueDate: todayISO(),
      eventId: event.id,
      accountId: event.accountId,
      notes: "Auto-created — the event has passed. Record attendees, screenings, and results on the event page.",
      // The task belongs to whoever owns the event, in that event's city.
      cityId: event.cityId,
      userId: event.userId,
    });
  }
}
