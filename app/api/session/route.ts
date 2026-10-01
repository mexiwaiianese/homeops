// Manager session: who is signed in, and a sign-out that ends it.
//
// Sign-out revokes the Supabase session (live mode) and forgets the active persona. It leaves the
// persona unlock and sandbox cookies alone. `redirect` is /dev/personas when this browser unlocked
// with the beta access code, and /login otherwise.
import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { clearDemoSessionCookie, getDemoSession } from "@/lib/demo-access";
import { personaSignOutPath } from "@/lib/persona-sign-out";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { baseCookieOptions, personaActiveCookie } from "@/lib/persona-login";
import { blankWorkspaceCookie } from "@/lib/provision-org";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const demo = await getDemoSession();
  if (demo) return NextResponse.json({ mode: "demo", signedIn: true, email: demo.email, role: demo.role });
  if (!isSupabaseConfigured()) return NextResponse.json({ mode: "demo", signedIn: false, email: null });
  const { user, organizationId } = await getAuthedContext();
  if (!user) return NextResponse.json({ mode: "auth", signedIn: false, email: null });
  return NextResponse.json({ mode: organizationId ? "live" : "auth", signedIn: true, email: user.email ?? null });
}

export async function DELETE() {
  const { supabase, user } = await getAuthedContext();
  const client = supabase || (await createSupabaseServerClient());
  if (client && user) await client.auth.signOut().catch(() => undefined);
  const response = NextResponse.json({ signedOut: true, redirect: await personaSignOutPath("/login") });
  response.cookies.set(personaActiveCookie, "", baseCookieOptions(0));
  const demo = clearDemoSessionCookie();
  response.cookies.set(demo.name, demo.value, demo.options);
  response.cookies.set(blankWorkspaceCookie, "", { ...baseCookieOptions(0) });
  return response;
}
