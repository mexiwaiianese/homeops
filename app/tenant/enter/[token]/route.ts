import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/rent";
import { consumeTenantLoginToken, tenantSessionCookie, tenantSessionCookieOptions } from "@/lib/tenant-auth";
import { tenantLoginPath, tenantPortalPath } from "@/lib/tenant-portal";

// The link in the text/email lands here. Exchange the one-time token for a session cookie.

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const origin = appOrigin(request);
  const result = await consumeTenantLoginToken(token, request.headers.get("user-agent"));
  if ("error" in result || !result.cookieValue) {
    const url = new URL(tenantLoginPath, origin);
    url.searchParams.set("error", ("error" in result && result.error) || "This sign-in link is not valid.");
    return NextResponse.redirect(url);
  }
  const response = NextResponse.redirect(new URL(tenantPortalPath, origin));
  response.cookies.set(tenantSessionCookie, result.cookieValue, tenantSessionCookieOptions());
  return response;
}
