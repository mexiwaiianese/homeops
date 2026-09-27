import { NextResponse } from "next/server";
import { isDemoOrganizationSlug } from "@/lib/demo-ledger";
import { leadingBid, type AuctionBid } from "@/lib/vendor-auction";
import { getDemoAutobid, listDemoOpportunitiesForVendor, seedManagerOpportunities } from "@/lib/vendor-auction-demo";
import { seedLiveManagerOpportunities } from "@/lib/vendor-auction-live";
import { demoBidAccess, demoSuccessfulJobs, getDemoGrants } from "@/lib/vendor-portal-demo";
import { JOBS_BEFORE_OPEN_BIDDING, accessSummary } from "@/lib/vendor-portal";
import { requireVendorActor } from "@/lib/vendor-session";
import { liveBidGate } from "@/lib/vendor-portal-live";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const actor = await requireVendorActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (actor.mode === "demo") {
    await seedManagerOpportunities(origin);
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

  // Demo sandboxes: make sure every approved request on the manager board has an open auction, so
  // the vendor sees the same opportunities the manager sees.
  const org = await actor.admin.from("organizations").select("slug, name").eq("id", actor.organizationId).maybeSingle();
  if (isDemoOrganizationSlug(org.data?.slug)) {
    await seedLiveManagerOpportunities({
      supabase: actor.admin,
      organizationId: actor.organizationId,
      organizationName: org.data?.name || "HomeOps Demo Management",
      origin,
    }).catch(() => null);
  }

  const { data: invites, error } = await actor.admin
    .from("vendor_bid_invites")
    .select("token, status, vendor_bid_opportunities(*, vendor_bids(*))")
    .eq("vendor_id", actor.vendorId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const opportunities = [];
  let access: Awaited<ReturnType<typeof liveBidGate>>["access"] = null;
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
    if (gate.access && (!access || gate.access.allowed)) access = gate.access;
    const bids: AuctionBid[] = ((opportunity.vendor_bids ?? []) as Array<{ id: string; vendor_id: string; amount_cents: number; source: AuctionBid["source"]; status: AuctionBid["status"] }>)
      .map((bid) => ({ id: bid.id, vendorId: bid.vendor_id, amountCents: bid.amount_cents, source: bid.source, status: bid.status }));
    const ownBid = bids.find((bid) => bid.vendorId === actor.vendorId && bid.status !== "withdrawn") || null;
    if (gate.notificationReason && !ownBid) continue;
    opportunities.push({
      id: opportunity.id,
      maintenanceRequestId: opportunity.maintenance_request_id,
      title: opportunity.title,
      address: opportunity.address1,
      city: opportunity.city,
      state: opportunity.state,
      budgetCents: opportunity.budget_cents,
      neededBy: opportunity.needed_by,
      status: opportunity.status,
      bidUrl: `${origin}/vendors/bid/${invite.token}`,
      ownBidCents: ownBid?.amountCents ?? null,
      ownBidSource: ownBid?.source ?? null,
      leadingCents: leadingBid(bids)?.amountCents ?? null,
      bidBlocked: ownBid ? null : gate.bidBlocked,
      accessScope: gate.access?.scope ?? null,
      accessSummary: gate.access ? accessSummary(gate.access) : null,
    });
  }
  opportunities.sort((a, b) => a.title.localeCompare(b.title));
  return NextResponse.json({
    mode: "live",
    successfulJobs: access?.successfulJobs ?? null,
    jobsRequired: JOBS_BEFORE_OPEN_BIDDING,
    access: access ? { ...access, summary: accessSummary(access) } : null,
    opportunities,
  });
}
