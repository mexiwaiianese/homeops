import { NextResponse } from "next/server";
import { applyNoStore } from "@/lib/http-security";
import { clientKey, unlockAttemptAllowed } from "@/lib/persona-login/gate";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Accepts auth tokens in the body and answers with JSON, never an HTML page. */
export async function POST(request: Request) {
  if (!unlockAttemptAllowed(`auth-session:${clientKey(request)}`)) {
    return applyNoStore(NextResponse.json({ error: "Too many attempts. Wait a few minutes." }, { status: 429 }));
  }
  const body = await request.json().catch(() => ({}));
  const accessToken = String(body.accessToken || "");
  const refreshToken = String(body.refreshToken || "");
  if (!accessToken || !refreshToken) {
    return applyNoStore(NextResponse.json({ error: "That sign-in link is not valid." }, { status: 400 }));
  }
  const supabase = await createSupabaseServerClient();
  if (!supabase) return applyNoStore(NextResponse.json({ error: "Sign-in is not configured on this server." }, { status: 503 }));
  const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) return applyNoStore(NextResponse.json({ error: "That sign-in link is not valid." }, { status: 401 }));
  return applyNoStore(NextResponse.json({ ok: true }));
}
