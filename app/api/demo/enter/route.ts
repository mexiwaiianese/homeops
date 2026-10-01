import { NextResponse } from "next/server";
import {
  consumeDemoAccessToken,
  demoLandingPath,
  demoPersonaCookies,
  issueDemoSessionCookie,
} from "@/lib/demo-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const granted = token ? await consumeDemoAccessToken(token) : null;
  if (!granted) {
    const dest = new URL("/", request.url);
    dest.searchParams.set("demoError", "That demo link has expired. Request a new one.");
    return NextResponse.redirect(dest);
  }
  const dest = new URL(demoLandingPath(granted.role), request.url);
  const response = NextResponse.redirect(dest);
  const session = issueDemoSessionCookie(granted);
  response.cookies.set(session.name, session.value, session.options);
  for (const cookie of demoPersonaCookies(granted.role)) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}
