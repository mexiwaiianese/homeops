// Manager session: who is signed in, and a sign-out that ends it.
//
// Sign-out revokes the Supabase session (live mode) and forgets the active persona. It leaves the
// persona unlock and sandbox cookies alone. `redirect` is /dev/personas when this browser unlocked
// with the beta access code, and /login otherwise.
import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { personaSignOutPath } from "@/lib/persona-sign-out";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { baseCookieOptions, personaActiveCookie } from "@/lib/persona-login";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ mode: "demo", signedIn: false, email: null });
  const { user, organizationId } = await getAuthedContext();
  if (!user) return NextResponse.json({ mode: "auth", signedIn: false, email: null });
  return NextResponse.json({ mode: organizationId ? "live" : "auth", signedIn: true, email: user.email ?? null });
}

export async function DELETE() {
  const { supabase, user } = await getAuthedContext();
  // The SSR client clears its auth cookies through next/headers, which is writable in a route handler.
  if (supabase && user) await supabase.auth.signOut().catch(() => undefined);
  const response = NextResponse.json({ signedOut: true, redirect: await personaSignOutPath("/login") });
  response.cookies.set(personaActiveCookie, "", baseCookieOptions(0));
  return response;
}
