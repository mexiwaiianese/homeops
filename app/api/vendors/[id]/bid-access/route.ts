import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { homes } from "@/lib/data";
import {
  demoBidAccess,
  demoManagerHomes,
  demoSuccessfulJobs,
  getDemoGrants,
  grantDemoBidding,
  revokeDemoBidding,
} from "@/lib/vendor-portal-demo";
import { JOBS_BEFORE_OPEN_BIDDING, accessSummary } from "@/lib/vendor-portal";
import { liveBidGate } from "@/lib/vendor-portal-live";

function demoAccess(vendorId: string) {
  const grants = getDemoGrants(vendorId);
  const access = demoBidAccess(vendorId, grants[0]?.homeIds[0] || "");
  const catalog = demoManagerHomes();
  return {
    mode: "demo" as const,
    successfulJobs: demoSuccessfulJobs(vendorId),
    jobsRequired: JOBS_BEFORE_OPEN_BIDDING,
    access: { ...access, summary: accessSummary(access) },
    grants: grants.map((grant) => ({
      id: grant.id,
      managerName: grant.managerName,
      grantedAt: grant.grantedAt,
      properties: catalog.filter((home) => grant.homeIds.includes(home.id)).map((home) => home.address),
    })),
    managerProperties: homes.map((home) => home.address),
  };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase) return NextResponse.json(demoAccess(id));
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { data: propertyRows } = await supabase.from("homes").select("id, address1").eq("organization_id", organizationId);
  const gate = await liveBidGate(supabase, {
    vendorId: id,
    homeId: propertyRows?.[0]?.id,
    title: "general",
    budgetCents: null,
    emergency: false,
  });
  const { data: grants } = await supabase.from("vendor_bid_grants").select("*").eq("vendor_id", id).eq("organization_id", organizationId);
  return NextResponse.json({
    mode: "live",
    successfulJobs: gate.access?.successfulJobs ?? 0,
    jobsRequired: JOBS_BEFORE_OPEN_BIDDING,
    access: gate.access ? { ...gate.access, summary: accessSummary(gate.access) } : null,
    grants: (grants ?? []).map((grant) => ({
      id: grant.id,
      managerName: grant.manager_label,
      grantedAt: grant.created_at,
      properties: (propertyRows ?? []).filter((home) => (grant.home_ids ?? []).includes(home.id)).map((home) => home.address1),
    })),
    managerProperties: (propertyRows ?? []).map((home) => home.address1),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { supabase, user, organizationId, role } = await getAuthedContext();
  if (!supabase) {
    if (body.action === "revoke") revokeDemoBidding(id);
    else grantDemoBidding(id);
    return NextResponse.json(demoAccess(id));
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!role || !["owner", "admin", "manager"].includes(role)) return NextResponse.json({ error: "A property manager has to allow this." }, { status: 403 });
  if (body.action === "revoke") {
    const { error } = await supabase.from("vendor_bid_grants").delete().eq("vendor_id", id).eq("organization_id", organizationId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    const { data: propertyRows } = await supabase.from("homes").select("id").eq("organization_id", organizationId);
    const { error } = await supabase.from("vendor_bid_grants").upsert({
      organization_id: organizationId,
      vendor_id: id,
      manager_label: user.email || "Property manager",
      granted_by: user.id,
      home_ids: (propertyRows ?? []).map((home) => home.id),
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,vendor_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return GET(request, { params: Promise.resolve({ id }) });
}
