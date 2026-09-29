import { NextResponse } from "next/server";
import { googleAuthEnabled } from "@/lib/google-auth";
import { isOperatorAdmin } from "@/lib/operator-admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const supabase = await createSupabaseServerClient();
  if (code) await supabase?.auth.exchangeCodeForSession(code);

  // Operator tools accept one Google account. Any other Google sign-in aimed at /dev is dropped.
  if (googleAuthEnabled && safeNext.startsWith("/dev") && supabase) {
    const { data } = await supabase.auth.getUser();
    if (!isOperatorAdmin(data.user)) {
      await supabase.auth.signOut();
      const url = new URL(safeNext, origin);
      url.searchParams.set("error", "not-admin");
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.redirect(`${origin}${safeNext}`);
}
