import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
