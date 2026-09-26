import { NextResponse } from "next/server";
import { getTenantContext, revokeTenantSession, tenantSessionCookie, tenantSessionCookieOptions } from "@/lib/tenant-auth";

export async function GET() {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ tenant: null }, { status: 401 });
  return NextResponse.json({ mode: context.mode, tenant: context.tenant });
}

export async function DELETE() {
  const context = await getTenantContext();
  if (context) await revokeTenantSession(context);
  const response = NextResponse.json({ signedOut: true });
  response.cookies.set(tenantSessionCookie, "", tenantSessionCookieOptions(0));
  return response;
}
