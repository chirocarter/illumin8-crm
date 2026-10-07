// What a partner business produced.
//
// A partner is a business (an account with status Active Partner or Past
// Partner), and a lead, appointment or event counts for it when it is tied to
// that business by any of the links people actually set:
//
//   • linked to the business directly        (account_id)
//   • came through one of its campaigns      (campaign_id → campaigns.account_id)
//   • came from an event it hosted           (event_id → events.account_id)
//   • an appointment for a lead that did     (appointments.lead_id → the rules above)
//
// Account_id alone is not enough: most leads from a partner's screening day
// carry the event, not the business. One definition, used by the Partner
// Report's numbers AND by the lists those numbers open (`?viaAccountId=`), so a
// count and its drill-down cannot disagree.
//
// Column names are written out in full on purpose. These run as correlated
// subqueries inside a query over accounts, and an unqualified name would bind
// to whichever table is nearest — the inner tables carry aliases (c, e) so the
// outer ones always win where intended.
import { sql, type SQL } from "drizzle-orm";

const campaignsOf = (acct: SQL) => sql`(select c.id from campaigns c where c.account_id = ${acct})`;
const hostedEventsOf = (acct: SQL) => sql`(select e.id from events e where e.account_id = ${acct})`;

/** A row of `leads` that came through business `acct`. */
export function leadViaAccount(acct: SQL): SQL {
  return sql`(leads.account_id = ${acct} or leads.campaign_id in ${campaignsOf(acct)} or leads.event_id in ${hostedEventsOf(acct)})`;
}

/** A row of `appointments` that came through business `acct`. */
export function appointmentViaAccount(acct: SQL): SQL {
  return sql`(appointments.account_id = ${acct} or appointments.campaign_id in ${campaignsOf(acct)}
    or appointments.event_id in ${hostedEventsOf(acct)}
    or appointments.lead_id in (select leads.id from leads where ${leadViaAccount(acct)}))`;
}

/** A row of `events` held at business `acct`, or run under one of its campaigns. */
export function eventViaAccount(acct: SQL): SQL {
  return sql`(events.account_id = ${acct} or events.campaign_id in ${campaignsOf(acct)})`;
}

/** The business id as a bound parameter, for the list filters. */
export const accountParam = (id: number): SQL => sql`${id}`;
