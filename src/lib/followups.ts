// The single definition of "follow-up", shared by the metric and its
// drill-down list so the number and the records behind it can never disagree.
//
// Deliberately its own module: metrics.ts pulls in server-only code, and this
// rule needs to be importable by plain scripts for verification.
import { sql, type SQL } from "drizzle-orm";
import { COMMUNICATION_TYPES } from "./taxonomy";

/**
 * A follow-up is derived, never chosen: a communication with a business that
 * has been contacted before. The first conversation with a business is a new
 * contact; every one after it follows up.
 *
 * The inner query is aliased `prior` so the outer columns can be written as
 * `activities.*` unambiguously — an unqualified column would bind to the
 * subquery's own copy of the table and silently match every row.
 */
export function followUpCondition(): SQL {
  const types = () => sql.join(COMMUNICATION_TYPES.map((t) => sql`${t}`), sql`, `);
  return sql`(
    activities.account_id is not null
    and activities.type in (${types()})
    and exists (
      select 1 from activities prior
      where prior.account_id = activities.account_id
        and prior.type in (${types()})
        and prior.occurred_at < activities.occurred_at
    )
  )`;
}
