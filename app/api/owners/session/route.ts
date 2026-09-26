import { NextResponse } from "next/server";
import { owners as demoOwners } from "@/lib/data";
import { getAuthedContext } from "@/lib/backend";
import { baseCookieOptions, personaActiveCookie } from "@/lib/persona-login";
import { personaSignOutPath } from "@/lib/persona-sign-out";
import { demoOwnerSessionCookie, ownerPortalAccess } from "@/lib/owner-portal-access";

const cookieOptions = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 14 };

export async function GET(request: Request) {
  const access = await ownerPortalAccess(request);
  if (access.mode === "error") return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json({ mode: access.mode, ownerId: access.ownerId, preview: access.preview });
}

// Demo only: choose an owner without a password. Live owners sign in with a magic link, Google, or Apple.
export async function POST(request: Request) {
  const { supabase } = await getAuthedContext();
  const body = await request.json().catch(() => ({}));
  if (supabase) return NextResponse.json({ error: "Use email, Google, or Apple sign-in to open your owner portal." }, { status: 400 });
  const owner = demoOwners.find((row) => row.id === String(body.ownerId || ""));
  if (!owner) return NextResponse.json({ error: "Choose an owner." }, { status: 400 });
  const response = NextResponse.json({ mode: "demo", ownerId: owner.id });
  response.cookies.set(demoOwnerSessionCookie, owner.id, cookieOptions);
  return response;
}

export async function DELETE() {
  const { supabase } = await getAuthedContext();
  if (supabase) await supabase.auth.signOut().catch(() => undefined);
  const response = NextResponse.json({ signedOut: true, redirect: await personaSignOutPath("/owners/login") });
  response.cookies.set(demoOwnerSessionCookie, "", { ...cookieOptions, maxAge: 0 });
  response.cookies.set(personaActiveCookie, "", baseCookieOptions(0));
  return response;
}
