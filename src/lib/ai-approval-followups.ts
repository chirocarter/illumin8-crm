import type { WriteStatement } from "../db/atomic-write";

export const APPROVAL_TASK_MARKER = "[AI approval follow-up]";

/** Calendar weekdays, not a holiday calendar. Noon avoids DST midnight edges. */
export function nextBusinessDay(today: string): string {
  const date = new Date(`${today}T12:00:00`);
  do { date.setDate(date.getDate() + 1); } while ([0, 6].includes(date.getDay()));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * An existing open/completed business task already covers the next touch.
 * A canceled approval task is a deliberate decision, not a reason to recreate
 * it on a repeated backfill. Other canceled tasks do not block a new follow-up.
 * Keep the task in the BUSINESS's city, never the reviewing admin's active city.
 */
function followUpInsert(where: string, args: WriteStatement["args"], due: string, createdAt: string): WriteStatement {
  return {
    sql: `INSERT INTO tasks (title, due_date, account_id, notes, city_id, user_id, created_at)
      SELECT 'Follow up with ' || a.name, ?, a.id,
        ? || char(10) || 'Review the approved research and make the first outreach. Log activity from this task to complete it.',
        a.city_id, CASE WHEN owner.role IN ('admin', 'user') THEN owner.id ELSE reviewer.id END, ?
      FROM accounts a
      LEFT JOIN users owner ON owner.id = a.user_id
      LEFT JOIN users reviewer ON reviewer.id = a.ai_reviewed_by AND reviewer.role IN ('admin', 'user')
      WHERE ${where} AND a.do_not_contact = 0 AND a.city_id IS NOT NULL
        AND (owner.role IN ('admin', 'user') OR reviewer.id IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM tasks t WHERE t.account_id = a.id AND t.city_id IS a.city_id
          AND (t.status IN ('Open', 'Completed') OR substr(t.notes, 1, ?) = ?)
        )`,
    args: [due, APPROVAL_TASK_MARKER, createdAt, ...args, APPROVAL_TASK_MARKER.length, APPROVAL_TASK_MARKER],
  };
}

/** Authorization is checked by the server action, not supplied by the form. */
export function approvalWrites(id: number, reviewerId: number, reviewedAt: string, due: string): WriteStatement[] {
  return [
    {
      sql: `UPDATE accounts SET ai_review_status = 'Approved', ai_reviewed_at = ?,
        ai_reviewed_by = ?, ai_review_reason = NULL WHERE id = ? AND ai_review_status = 'Pending'`,
      args: [reviewedAt, reviewerId, id],
    },
    followUpInsert("a.id = ? AND a.ai_review_status = 'Approved' AND a.ai_reviewed_at = ? AND a.ai_reviewed_by = ?",
      [id, reviewedAt, reviewerId], due, reviewedAt),
  ];
}

/** Null scope is all cities, allowed ONLY by the admin-only action. */
export function backfillWrite(cityId: number | null, due: string, createdAt: string): WriteStatement {
  return followUpInsert("a.ai_review_status = 'Approved'" + (cityId === null ? "" : " AND a.city_id = ?"),
    cityId === null ? [] : [cityId], due, createdAt);
}
