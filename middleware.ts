import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_MARKETING = new Set([
  "/",
  "/pricing",
  "/about",
  "/changelog",
  "/register",
  "/vendors/signup",
  "/property-management-software",
  "/terms",
  "/sitemap.xml",
  "/robots.txt",
]);

const PEEK_WRITE_ALLOWED = new Set(["/api/demo/request", "/api/session", "/api/workspace/cancel"]);

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  if ((code || tokenHash) && pathname !== "/auth/callback" && !pathname.startsWith("/api/")) {
    const dest = request.nextUrl.clone();
    dest.pathname = "/auth/callback";
    return NextResponse.redirect(dest);
  }

  if (PUBLIC_MARKETING.has(pathname) || pathname.startsWith("/vs/")) return NextResponse.next();

  // "Peek first - no email" sessions may read, not write. The mode token is the fifth payload
  // part of the signed demo cookie; removing it breaks the signature, so this unsigned read is
  // enough to refuse the write here. Requesting a real demo link and signing out stay open.
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method) && !PEEK_WRITE_ALLOWED.has(pathname)) {
    const parts = (request.cookies.get("homeops_demo")?.value || "").split(".");
    if (parts.length === 6 && parts[4] === "ro") {
      return NextResponse.json(
        { error: "This is a read-only peek. Email yourself a demo link to make changes." },
        { status: 403 },
      );
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet: Parameters<SetAllCookies>[0]) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|product/|about/).*)"] };
