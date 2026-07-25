import { NextRequest, NextResponse } from "next/server";

const SECRET = process.env.SESSION_SECRET ?? "illumin8-dev-secret-change-me";

// Edge-safe base64url helpers (no Buffer in the edge runtime)
function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function strFromB64url(s: string): string {
  return atob(s.replace(/-/g, "+").replace(/_/g, "/"));
}

async function isValid(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    if (b64urlFromBytes(new Uint8Array(mac)) !== sig) return false;
    const [, expires] = strFromB64url(payload).split("|");
    return Number(expires) > Date.now();
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname === "/login" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/join") || // public QR sign-up pages
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest"
  ) {
    return NextResponse.next();
  }
  const ok = await isValid(req.cookies.get("i8_session")?.value);
  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
