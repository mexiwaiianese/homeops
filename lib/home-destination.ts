// Where a logo or wordmark click should land for the current browser session.
// Signed out: the public homepage. Signed in: the default page for that persona.
//
// Checked in this order so a persona cookie wins over a leftover operator or demo cookie:
//   manager with a workspace (live organization or fresh blank workspace)  -> /app
//   owner session cookie                                                   -> /owners
//   vendor session cookie                                                  -> /vendors/desk
//   tenant session                                                         -> /tenant
//   live sign-in linked to an owner or vendor record                       -> /owners or /vendors/desk
//   demo link session (manager / owner / vendor)                           -> that role's demo landing
//   platform operator                                                      -> /admin/packages
//   nobody                                                                 -> /

import { cookies } from "next/headers";
import { getAuthedContext } from "@/lib/backend";
import { demoLandingPath } from "@/lib/demo-access";
import { isOperatorAdmin, operatorSessionCookie, verifyOperatorCookie } from "@/lib/operator-admin";
import { demoOwnerSessionCookie } from "@/lib/owner-portal-access";
import { opsHomePath } from "@/lib/product-features";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getTenantContext } from "@/lib/tenant-auth";
import { demoVendorSessionCookie } from "@/lib/vendor-job-demo";

export const PUBLIC_HOME = "/";
export const OWNER_HOME = "/owners";
export const VENDOR_HOME = "/vendors/desk";
export const TENANT_HOME = "/tenant";
export const ADMIN_HOME = "/admin/packages";

export async function resolveHomeDestination(): Promise<string> {
  const ctx = await getAuthedContext();
  if (ctx.organizationId) return opsHomePath("live");

  const jar = await cookies();
  if (jar.get(demoOwnerSessionCookie)?.value) return OWNER_HOME;
  if (jar.get(demoVendorSessionCookie)?.value) return VENDOR_HOME;

  const tenant = await getTenantContext().catch(() => null);
  if (tenant) return TENANT_HOME;

  if (ctx.user) {
    const admin = createSupabaseAdminClient();
    if (admin) {
      const owner = await admin.from("owner_users").select("id").eq("auth_user_id", ctx.user.id).limit(1).maybeSingle();
      if (owner.data) return OWNER_HOME;
      const vendor = await admin.from("vendor_users").select("id").eq("auth_user_id", ctx.user.id).limit(1).maybeSingle();
      if (vendor.data) return VENDOR_HOME;
    }
  }

  if (ctx.demoSession) return demoLandingPath(ctx.demoSession.role);

  if (isOperatorAdmin(ctx.user) || verifyOperatorCookie(jar.get(operatorSessionCookie)?.value)) return ADMIN_HOME;

  return PUBLIC_HOME;
}
