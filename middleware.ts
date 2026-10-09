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

/** Pages and signup calls outside the demo workspace. A peek cookie must not follow the visitor here. */
function leftTheDemo(pathname: string) {
  if (PUBLIC_MARKETING.has(pathname) || pathname.startsWith("/vs/")) return true;
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname.startsWith("/register")) return true;
  if (pathname.startsWith("/auth/")) return true;
  if (pathname.startsWith("/vendors/signup") || pathname.startsWith("/vendors/login")) return true;
  if (pathname.startsWith("/owners/login") || pathname.startsWith("/tenant/login") || pathname.startsWith("/admin/login")) return true;
  if (pathname.startsWith("/api/vendors/promo") || pathname.startsWith("/api/vendors/signup") || pathname.startsWith("/api/register")) return true;
  return false;
}

function peekCookie(request: NextRequest) {
  const parts = (request.cookies.get("homeops_demo")?.value || "").split(".");
  return parts.length === 6 && parts[4] === "ro";
}

function expirePeekCookie(response: NextResponse) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set("homeops_demo", "", { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 0 });
  response.headers.append(
    "Set-Cookie",
    `homeops_demo=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${secure ? "" : "; Secure"}`,
  );
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  if ((code || tokenHash) && pathname !== "/auth/callback" && !pathname.startsWith("/api/")) {
    const dest = request.nextUrl.clone();
    dest.pathname = "/auth/callback";
    return NextResponse.redirect(dest);
  }

  const dropPeek = peekCookie(request) && leftTheDemo(pathname);

  if (PUBLIC_MARKETING.has(pathname) || pathname.startsWith("/vs/")) {
    const response = NextResponse.next();
    return dropPeek ? expirePeekCookie(response) : response;
  }

  // "Peek first - no email" sessions may read, not write, and only while they stay in the demo.
  // Leaving for signup, login, or the marketing site expires the peek cookie and allows the request.
  if (!dropPeek && pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method) && !PEEK_WRITE_ALLOWED.has(pathname)) {
    if (peekCookie(request)) {
      return NextResponse.json(
        { error: "This is a read-only peek. Email yourself a demo link to make changes." },
        { status: 403 },
      );
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    const response = NextResponse.next();
    return dropPeek ? expirePeekCookie(response) : response;
  }

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
  return dropPeek ? expirePeekCookie(response) : response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|product/|about/).*)"] };
