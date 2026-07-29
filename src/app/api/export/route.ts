import { NextRequest } from "next/server";
import {
  listAccounts, listActivities, listAppointments, listContacts, listEvents,
  listLeads, listOpportunities, listTasks, type SP,
} from "@/lib/lists";

const BUILDERS: Record<string, (sp: SP) => Promise<Record<string, unknown>[]>> = {
  accounts: listAccounts,
  contacts: listContacts,
  activities: listActivities,
  opportunities: listOpportunities,
  events: listEvents,
  leads: listLeads,
  appointments: listAppointments,
  tasks: listTasks,
};

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const str = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const entity = params.get("entity") ?? "";
  const builder = BUILDERS[entity];
  if (!builder) return new Response("Unknown entity", { status: 400 });

  // Repeated params (multi-select filters like ?status=A&status=B) must arrive
  // as arrays — assigning in a loop would keep only the last value and the CSV
  // would silently disagree with the list it was exported from.
  const sp: SP = {};
  for (const key of new Set(params.keys())) {
    if (key === "entity") continue;
    const all = params.getAll(key);
    sp[key] = all.length > 1 ? all : all[0];
  }

  const rows = await builder(sp);
  const today = new Date().toISOString().slice(0, 10);
  return new Response(toCSV(rows as Record<string, unknown>[]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="illumin8-${entity}-${today}.csv"`,
    },
  });
}
