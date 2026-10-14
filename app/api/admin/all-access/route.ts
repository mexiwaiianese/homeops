import { NextResponse } from "next/server";
import { ensureAllAccessAccount, signInAllAccessAccount } from "@/lib/all-access-account";
import { requirePlatformAdmin } from "@/lib/operator-admin";
import { baseCookieOptions } from "@/lib/persona-login/gate";
import { blankWorkspaceCookie } from "@/lib/provision-org";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;
  const admin = createSupabaseAdminClient();
  try {
    const account = await ensureAllAccessAccount(admin);
    if (!admin) {
      const response = NextResponse.json({ redirect: "/app", email: account.ownerEmail });
      response.cookies.set(blankWorkspaceCookie, account.organizationId, baseCookieOptions(14 * 24 * 60 * 60));
      return response;
    }
    await signInAllAccessAccount(admin);
    const response = NextResponse.json({ redirect: "/app", email: account.ownerEmail });
    response.cookies.set(blankWorkspaceCookie, "", baseCookieOptions(0));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not open the all-access account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
