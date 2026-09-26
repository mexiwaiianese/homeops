// Manager session: who is signed in, and a sign-out that returns the browser to /login.
//
// Sign-out revokes the Supabase session (live mode) and forgets the active persona. It leaves the
// persona unlock and sandbox cookies alone, so a beta tester lands on /login with the persona
// picker still available and their sandbox data intact.
import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
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
  const response = NextResponse.json({ signedOut: true });
  response.cookies.set(personaActiveCookie, "", baseCookieOptions(0));
  return response;
}
