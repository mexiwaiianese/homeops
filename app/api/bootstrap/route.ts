import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { homes, owners, tenants } from "@/lib/data";
import { isDemoOrganizationSlug } from "@/lib/demo-ledger";
import { listDemoMaintenance } from "@/lib/maintenance-demo";
import { getDemoOrgSettings } from "@/lib/org-settings";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { seedManagerOpportunities } from "@/lib/vendor-auction-demo";
import { seedLiveManagerOpportunities } from "@/lib/vendor-auction-live";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const { supabase, user, organizationId, role } = await getAuthedContext();
  if (!supabase) {
    const seeded = await seedManagerOpportunities(origin);
    return NextResponse.json({
      mode: "demo",
      homes,
      owners,
      tenants,
      maintenance: listDemoMaintenance(),
      settings: getDemoOrgSettings(),
      role: "manager",
      openAuctionJobIds: seeded.openJobIds,
    });
  }
  if (!user || !organizationId) return NextResponse.json({ mode: "auth", authenticated: false }, { status: 401 });

  const orgRow = await supabase.from("organizations").select("settings, slug, name").eq("id", organizationId).maybeSingle();
  if (orgRow.error) return NextResponse.json({ error: orgRow.error.message }, { status: 500 });

  // Demo sandboxes keep their board in sync with the vendor desks: any approved, unassigned request
  // gets an open auction so the vendors that match it can see and bid on it.
  if (isDemoOrganizationSlug(orgRow.data?.slug)) {
    const admin = createSupabaseAdminClient() || supabase;
    await seedLiveManagerOpportunities({ supabase: admin, organizationId, organizationName: orgRow.data?.name || "HomeOps Demo Management", origin }).catch(() => null);
  }

  const [ownerRows, homeRows, tenantRows, maintenanceRows, auctionRows] = await Promise.all([
    supabase.from("owners").select("*").eq("organization_id", organizationId).order("full_name"),
    supabase.from("homes").select("*, home_assets(*)").eq("organization_id", organizationId).order("address1"),
    supabase.from("leases").select("*, tenants(*)").eq("organization_id", organizationId).eq("status", "active"),
    supabase.from("maintenance_requests").select("*, homes(address1, city, state), tenants(full_name), vendors(name)").eq("organization_id", organizationId).order("opened_at", { ascending: false }),
    supabase.from("vendor_bid_opportunities").select("maintenance_request_id").eq("organization_id", organizationId).eq("status", "open"),
  ]);

  const firstError = ownerRows.error || homeRows.error || tenantRows.error || maintenanceRows.error;
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
    openAuctionJobIds: (auctionRows.data ?? []).map((row) => row.maintenance_request_id),
  });
}
