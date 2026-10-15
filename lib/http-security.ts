import { NextResponse, type NextRequest } from "next/server";
import { nonIndexablePath } from "@/lib/indexing";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_EXEMPT = new Set(["/api/rent/webhooks/stripe", "/api/financial/qbo/cron", "/api/invoice-platform-discovery/cron"]);

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function supabaseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export function applyNoStore(response: NextResponse, pathname = "") {
  response.headers.set("Cache-Control", "no-cache, no-store");
  response.headers.set("Pragma", "no-cache");
  const tokenInUrl = pathname === "/auth/callback"
    || pathname === "/api/financial/qbo/callback"
    || pathname === "/api/vendors/signup/return";
  response.headers.set("Referrer-Policy", tokenInUrl ? "no-referrer" : "strict-origin-when-cross-origin");
  if (nonIndexablePath(pathname)) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

/** 302 with no Referer, so a token in the request URL is not leaked onward. */
export function foundRedirect(location: string | URL) {
  const response = NextResponse.redirect(location, 302);
  applyNoStore(response);
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export function appOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = forwardedHost || requestUrl.host;
  const hostname = host.split(":")[0]?.toLowerCase() || "";
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    const proto = forwardedHost ? (forwardedProto || "http") : requestUrl.protocol.replace(":", "");
    return `${proto}://${host}`;
  }
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  return requestUrl.origin;
}

/** Relative app path only. Rejects protocol-relative and off-site targets. */
export function sameOriginPath(value: string | null | undefined, fallback: string) {
  const path = String(value || "").trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.includes("://") || /[\u0000-\u001f\s]/.test(path)) {
    return fallback;
  }
  return path;
}

export function httpsRedirect(request: NextRequest) {
  const host = request.headers.get("host") || "";
  const hostname = host.split(":")[0]?.toLowerCase() || "";
  if (hostname === "localhost" || hostname === "127.0.0.1") return null;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto !== "http") return null;
  const url = request.nextUrl.clone();
  url.protocol = "https:";
  return applyNoStore(NextResponse.redirect(url, 308));
}

export function rejectedMethod(method: string) {
  if (method !== "TRACE" && method !== "TRACK") return null;
  const response = new NextResponse(null, { status: 405 });
  response.headers.set("Allow", "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS");
  return applyNoStore(response);
}

function trustedHosts(request: Request) {
  const hosts = new Set<string>();
  const add = (value: string | null) => {
    const host = value?.split(",")[0]?.trim().toLowerCase();
    if (host) hosts.add(host);
  };
  add(request.headers.get("host"));
  add(request.headers.get("x-forwarded-host"));
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try { hosts.add(new URL(configured).host.toLowerCase()); } catch { /* ignore a bad app URL */ }
  }
  return hosts;
}

/** Cookie-authenticated writes must come from this app. Webhooks authenticate another way. */
export function crossSiteMutation(request: Request) {
  if (!MUTATING.has(request.method.toUpperCase())) return false;
  const path = new URL(request.url).pathname;
  if (CSRF_EXEMPT.has(path)) return false;
  const allowed = trustedHosts(request);
  const presented = request.headers.get("origin") || request.headers.get("referer");
  if (!presented) return true;
  try {
    return !allowed.has(new URL(presented).host.toLowerCase());
  } catch {
    return true;
  }
}
