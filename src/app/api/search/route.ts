import { NextRequest } from "next/server";
import { globalSearch } from "@/lib/search";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json({ hits: [] });
  const hits = await globalSearch(q, 4);
  return Response.json({ hits });
}
