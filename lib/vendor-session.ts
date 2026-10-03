import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getAuthedContext } from "@/lib/backend";
import { getDemoSession } from "@/lib/demo-access";
import { getVendorSubscriber } from "@/lib/vendor-billing-demo";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { vendors as demoVendors } from "@/lib/vendor-demo";
import { linkLiveSignup } from "@/lib/vendor-billing-live";
import { demoVendorSessionCookie } from "@/lib/vendor-job-demo";

export type VendorActor =
  | { mode: "demo"; vendorId: string; organizationId: null; admin: null; user: null }
  | { mode: "live"; vendorId: string; organizationId: string; admin: SupabaseClient; user: User };

export type DemoVendorPublic = {
  id: string;
  name: string;
  trade: string;
  email: string;
  city: string;
};

/** Demo desk cookie, or the seeded vendor from a vendor-role demo link. Live Auth still wins. */
export async function demoVendorFromCookies(): Promise<DemoVendorPublic | null> {
  const cookieId = (await cookies()).get(demoVendorSessionCookie)?.value || null;
  const session = await getDemoSession();
  const vendorId = cookieId || (session?.role === "vendor"
    ? (demoVendors.find((row) => row.workflow_stage !== "invited")?.id || demoVendors[0]?.id || null)
    : null);
  if (!vendorId) return null;
  const seeded = demoVendors.find((row) => row.id === vendorId);
  if (seeded) {
    return { id: seeded.id, name: seeded.name, trade: seeded.trade, email: seeded.email || "", city: seeded.city };
  }
  const subscriber = getVendorSubscriber(vendorId);
  if (!subscriber) return null;
  return { id: subscriber.id, name: subscriber.companyName, trade: subscriber.trade, email: subscriber.email, city: subscriber.city };
}

export async function requireVendorActor(): Promise<VendorActor | { error: string; status: number }> {
  const ctx = await getAuthedContext();
  if (!ctx.user) {
    const demo = await demoVendorFromCookies();
    if (!demo) return { error: "Sign in to the vendor desk.", status: 401 };
    return { mode: "demo", vendorId: demo.id, organizationId: null, admin: null, user: null };
  }
  const admin = createSupabaseAdminClient() || ctx.supabase;
  if (!admin) return { error: "The vendor desk is not configured.", status: 503 };
  let { data } = await admin.from("vendor_users").select("vendor_id, organization_id").eq("auth_user_id", ctx.user.id).maybeSingle();
  if (!data?.vendor_id) {
    await linkLiveSignup(admin, ctx.user);
    const again = await admin.from("vendor_users").select("vendor_id, organization_id").eq("auth_user_id", ctx.user.id).maybeSingle();
    data = again.data;
  }
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
