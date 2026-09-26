import { NextResponse } from "next/server";
import { getDemoAutobid, listDemoOpportunitiesForVendor, seedManagerOpportunities } from "@/lib/vendor-auction-demo";
import { demoBidAccess, demoSuccessfulJobs, getDemoGrants } from "@/lib/vendor-portal-demo";
import { JOBS_BEFORE_OPEN_BIDDING, accessSummary } from "@/lib/vendor-portal";
import { requireVendorActor } from "@/lib/vendor-session";
import { liveBidGate } from "@/lib/vendor-portal-live";

export async function GET(request: Request) {
  const actor = await requireVendorActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (actor.mode === "demo") {
    await seedManagerOpportunities(new URL(request.url).origin);
    const grants = getDemoGrants(actor.vendorId);
    const access = demoBidAccess(actor.vendorId, grants[0]?.homeIds[0] || "");
    return NextResponse.json({
      mode: "demo",
      successfulJobs: demoSuccessfulJobs(actor.vendorId),
      jobsRequired: JOBS_BEFORE_OPEN_BIDDING,
      access: { ...access, summary: accessSummary(access) },
      autobidEnabled: getDemoAutobid(actor.vendorId).enabled,
      opportunities: listDemoOpportunitiesForVendor(actor.vendorId),
    });
  }
  const { data: invites, error } = await actor.admin
    .from("vendor_bid_invites")
    .select("token, status, vendor_bid_opportunities(*)")
    .eq("vendor_id", actor.vendorId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const opportunities = [];
  for (const invite of invites ?? []) {
    const opportunity = Array.isArray(invite.vendor_bid_opportunities) ? invite.vendor_bid_opportunities[0] : invite.vendor_bid_opportunities;
    if (!opportunity || (opportunity.status !== "open" && opportunity.awarded_vendor_id !== actor.vendorId)) continue;
    const requestRow = (await actor.admin.from("maintenance_requests").select("home_id, priority").eq("id", opportunity.maintenance_request_id).maybeSingle()).data;
    const gate = await liveBidGate(actor.admin, {
      vendorId: actor.vendorId,
      homeId: requestRow?.home_id,
      title: opportunity.title,
      budgetCents: opportunity.budget_cents,
      neededBy: opportunity.needed_by,
      city: opportunity.city,
      state: opportunity.state,
      emergency: String(requestRow?.priority || "").toLowerCase() === "emergency",
    });
    if (gate.notificationReason) continue;
    opportunities.push({
      id: opportunity.id,
      title: opportunity.title,
      address: opportunity.address1,
      city: opportunity.city,
      state: opportunity.state,
      budgetCents: opportunity.budget_cents,
      neededBy: opportunity.needed_by,
      status: opportunity.status,
      bidUrl: `${new URL(request.url).origin}/vendors/bid/${invite.token}`,
      bidBlocked: gate.bidBlocked,
      accessSummary: gate.access ? accessSummary(gate.access) : null,
    });
  }
  return NextResponse.json({ mode: "live", opportunities });
}
