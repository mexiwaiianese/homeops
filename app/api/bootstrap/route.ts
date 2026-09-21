import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { homes, initialMaintenance, owners, tenants } from "@/lib/data";
import { getDemoOrgSettings } from "@/lib/org-settings";

export async function GET() {
  const { supabase, user, organizationId, role } = await getAuthedContext();
  if (!supabase) return NextResponse.json({ mode: "demo", homes, owners, tenants, maintenance: initialMaintenance, settings: getDemoOrgSettings(), role: "manager" });
  if (!user || !organizationId) return NextResponse.json({ mode: "auth", authenticated: false }, { status: 401 });

  const [ownerRows, homeRows, tenantRows, maintenanceRows, orgRow] = await Promise.all([
    supabase.from("owners").select("*").eq("organization_id", organizationId).order("full_name"),
    supabase.from("homes").select("*, home_assets(*)").eq("organization_id", organizationId).order("address1"),
    supabase.from("leases").select("*, tenants(*)").eq("organization_id", organizationId).eq("status", "active"),
    supabase.from("maintenance_requests").select("*, homes(address1, city, state), tenants(full_name), vendors(name)").eq("organization_id", organizationId).order("opened_at", { ascending: false }),
    supabase.from("organizations").select("settings").eq("id", organizationId).maybeSingle(),
  ]);

  const firstError = ownerRows.error || homeRows.error || tenantRows.error || maintenanceRows.error || orgRow.error;
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 });

  return NextResponse.json({
    mode: "live",
    authenticated: true,
    user: { email: user.email, role },
    owners: ownerRows.data,
    homes: homeRows.data,
    leases: tenantRows.data,
    maintenance: maintenanceRows.data,
    settings: orgRow.data?.settings ?? {},
  });
}
