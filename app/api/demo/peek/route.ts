import { NextResponse } from "next/server";
import { issuePeekSessionCookie } from "@/lib/demo-access";

export const dynamic = "force-dynamic";

/**
 * "Peek first - no email." Opens the seeded manager workspace read-only.
 * No token, no email, and the middleware refuses every write while this cookie is set.
 */
export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/demo", request.url));
  const session = issuePeekSessionCookie();
  response.cookies.set(session.name, session.value, session.options);
  return response;
}
