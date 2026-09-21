import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase?.auth.exchangeCodeForSession(code);
  }
  const next = searchParams.get("next") || "/";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
