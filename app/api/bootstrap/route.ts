import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { homes, owners, tenants } from "@/lib/data";
import { isDemoOrganizationSlug } from "@/lib/demo-ledger";
import { healDemoBoard } from "@/lib/demo-seed-live";
import { listDemoMaintenance } from "@/lib/maintenance-demo";
import { getDemoOrgSettings } from "@/lib/org-settings";
import { cookies } from "next/headers";
import { ALL_FEATURES_ON } from "@/lib/product-features";
import { blankWorkspaceCookie, memoryWorkspaceById } from "@/lib/provision-org";
import { featuresForOrganization } from "@/lib/subscription-packages";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { seedManagerOpportunities } from "@/lib/vendor-auction-demo";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const { supabase, user, organizationId, role } = await getAuthedContext();
  if (!supabase) {
    const blankId = (await cookies()).get(blankWorkspaceCookie)?.value;
    const blank = blankId ? memoryWorkspaceById(blankId) : null;
    if (blank) {
      return NextResponse.json({
        mode: "live",
        authenticated: true,
        user: { email: blank.ownerEmail, role: "owner" },
        owners: [],
        homes: [],
        leases: [],
        maintenance: [],
        settings: getDemoOrgSettings(),
        openAuctionJobIds: [],
        features: await featuresForOrganization(blank.organizationId),
        packageId: blank.packageId,
        organizationName: blank.name,
      });
    }
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
      features: ALL_FEATURES_ON,
    });
  }
  if (!user || !organizationId) return NextResponse.json({ mode: "auth", authenticated: false }, { status: 401 });

  const orgRow = await supabase.from("organizations").select("settings, slug, name").eq("id", organizationId).maybeSingle();
  if (orgRow.error) return NextResponse.json({ error: orgRow.error.message }, { status: 500 });

  // Demo sandboxes keep their board in sync with the vendor desks: any approved, unassigned request
  // gets an open auction so the vendors that match it can see and bid on it.
  if (isDemoOrganizationSlug(orgRow.data?.slug)) {
    await healDemoBoard(createSupabaseAdminClient() || supabase, organizationId, origin);
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
    features: await featuresForOrganization(organizationId),
    organizationName: orgRow.data?.name ?? null,
  });
}
