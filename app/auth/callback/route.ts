import { NextResponse } from "next/server";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import { isOperatorAdmin } from "@/lib/operator-admin";
import { applyClearedDemoCookies } from "@/lib/demo-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { linkLiveSignup } from "@/lib/vendor-billing-live";

async function landingForUser(user: User) {
  if (isOperatorAdmin(user)) return "/admin/login";
  const admin = createSupabaseAdminClient();
  if (!admin) return "/login";
  await linkLiveSignup(admin, user);
  const [{ data: vendor }, { data: owner }, { data: member }] = await Promise.all([
    admin.from("vendor_users").select("id").eq("auth_user_id", user.id).maybeSingle(),
    admin.from("owner_users").select("id").eq("auth_user_id", user.id).maybeSingle(),
    admin.from("organization_members").select("role").eq("user_id", user.id).limit(1).maybeSingle(),
  ]);
  if (vendor) return "/vendors/desk";
  if (owner) return "/owners";
  if (member) return "/app";
  return "/login";
}

async function consumeTokenHash(supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>, tokenHash: string, type: string) {
  const preferred = type === "magiclink" || type === "email" ? type : "magiclink";
  const types = preferred === "magiclink" ? (["magiclink", "email"] as const) : (["email", "magiclink"] as const);
  for (const otpType of types) {
    const verify = await supabase.auth.verifyOtp({ type: otpType as EmailOtpType, token_hash: tokenHash });
    if (verify.data.user) return verify.data.user;
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = (searchParams.get("type") || "").toLowerCase();
  const supabase = await createSupabaseServerClient();
  if (tokenHash && supabase) {
    await consumeTokenHash(supabase, tokenHash, type);
  } else if (code && supabase) {
    await supabase.auth.exchangeCodeForSession(code);
  }
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  let dest = "/login";
  if ((type === "signup" || type === "email_change") && !tokenHash) {
    dest = "/login?confirmed=1";
  } else if (user) {
    dest = await landingForUser(user);
  } else if (tokenHash) {
    dest = "/login?error=otp_expired";
  }
  const response = NextResponse.redirect(`${origin}${dest}`);
  applyClearedDemoCookies(response);
  return response;
}
