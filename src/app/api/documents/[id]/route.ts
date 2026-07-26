import { NextRequest } from "next/server";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";
import { canAccessCity } from "@/lib/scope";

// Serves a stored document. Middleware proves you're signed in; this route
// additionally proves the file is yours to read — a signed-in user from another
// city must not be able to pull a document just by guessing its id.
// ?download=1 forces a save dialog; otherwise PDFs/images open inline.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const doc = await db.query.documents.findFirst({ where: eq(s.documents.id, Number(id)) });
  if (!doc) return new Response("Not found", { status: 404 });

  // Documents inherit their city from whatever they're attached to; an
  // unattached file is general-purpose and readable by any signed-in user.
  const owner = doc.projectId
    ? await db.query.projects.findFirst({ where: eq(s.projects.id, doc.projectId), columns: { cityId: true } })
    : doc.campaignId
    ? await db.query.campaigns.findFirst({ where: eq(s.campaigns.id, doc.campaignId), columns: { cityId: true } })
    : doc.accountId
    ? await db.query.accounts.findFirst({ where: eq(s.accounts.id, doc.accountId), columns: { cityId: true } })
    : null;
  // Same 404 as "missing", so ids can't be probed to learn what exists elsewhere.
  if (!(await canAccessCity(owner?.cityId ?? null))) return new Response("Not found", { status: 404 });

  const disposition = req.nextUrl.searchParams.get("download") ? "attachment" : "inline";
  return new Response(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(doc.size),
      "Content-Disposition": `${disposition}; filename="${doc.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
