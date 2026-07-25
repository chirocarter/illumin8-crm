import { NextRequest } from "next/server";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";

// Serves a stored document (auth enforced by middleware). ?download=1 forces
// a save dialog; otherwise PDFs/images open inline in the browser.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const doc = await db.query.documents.findFirst({ where: eq(s.documents.id, Number(id)) });
  if (!doc) return new Response("Not found", { status: 404 });

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
