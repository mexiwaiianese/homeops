import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { baseCookieOptions, personaActiveCookie } from "@/lib/persona-login";
import { personaSignOutPath } from "@/lib/persona-sign-out";
import { getTenantContext, revokeTenantSession, tenantSessionCookie, tenantSessionCookieOptions } from "@/lib/tenant-auth";

export async function GET() {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ tenant: null }, { status: 401 });
  return NextResponse.json({ mode: context.mode, tenant: context.tenant });
}

export async function DELETE() {
  const context = await getTenantContext();
  if (context) await revokeTenantSession(context);
  const { supabase, user } = await getAuthedContext();
  if (supabase && user) await supabase.auth.signOut().catch(() => undefined);
  const response = NextResponse.json({ signedOut: true, redirect: await personaSignOutPath("/tenant/login") });
  response.cookies.set(tenantSessionCookie, "", tenantSessionCookieOptions(0));
  response.cookies.set(personaActiveCookie, "", baseCookieOptions(0));
  return response;
}
