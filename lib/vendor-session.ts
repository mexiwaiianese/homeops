import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getAuthedContext } from "@/lib/backend";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { demoVendorSessionCookie } from "@/lib/vendor-job-demo";

export type VendorActor =
  | { mode: "demo"; vendorId: string; organizationId: null; admin: null; user: null }
  | { mode: "live"; vendorId: string; organizationId: string; admin: SupabaseClient; user: User };

export async function requireVendorActor(): Promise<VendorActor | { error: string; status: number }> {
  const ctx = await getAuthedContext();
  if (!ctx.supabase) {
    const vendorId = (await cookies()).get(demoVendorSessionCookie)?.value;
    if (!vendorId) return { error: "Sign in to the vendor desk.", status: 401 };
    return { mode: "demo", vendorId, organizationId: null, admin: null, user: null };
  }
  if (!ctx.user) return { error: "Sign in to the vendor desk.", status: 401 };
  const admin = createSupabaseAdminClient() || ctx.supabase;
  const { data } = await admin.from("vendor_users").select("vendor_id, organization_id").eq("auth_user_id", ctx.user.id).maybeSingle();
  if (!data?.vendor_id) return { error: "This login is not linked to a vendor company.", status: 403 };
  return {
    mode: "live",
    vendorId: data.vendor_id,
    organizationId: data.organization_id,
    admin,
    user: ctx.user,
  };
}

export function missingPortalTable(message: string) {
  return /schema cache|does not exist|vendor_notification_rules|vendor_bid_grants|vendor_crew_members|vendor_receivables/i.test(message);
}
