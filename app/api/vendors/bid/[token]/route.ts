import { NextResponse } from "next/server";
import { findDemoInvite, markDemoInviteViewed, placeDemoBid } from "@/lib/vendor-auction-demo";
import { getDemoAutobid, getDemoCalendar } from "@/lib/vendor-auction-demo";
import { vendors as demoVendors } from "@/lib/vendor-demo";
import { leadingBid, participatingBidCount, publishedLeadBid, vendorBidOutcome, vendorOwnBid, type AuctionBid } from "@/lib/vendor-auction";
import { autobidBlockReason } from "@/lib/vendor-auction";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { runLiveAutobid } from "@/lib/vendor-auction-live";
import { ensureDemoJobSite, getDemoJobByRequest } from "@/lib/vendor-job-demo";
import { jobFieldPath } from "@/lib/vendor-job";

function publicOpportunity(input: {
  organizationName: string;
  vendorName: string;
  title: string;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  budgetCents: number | null;
  neededBy: string | null;
  endsAt: string;
  status: string;
  awardedVendorId?: string | null;
  vendorId: string;
  bids: AuctionBid[];
  calendarConnected: boolean;
  autobid: ReturnType<typeof getDemoAutobid>;
  autobidBlocked: string | null;
  fieldUrl?: string | null;
}) {
  const lead = publishedLeadBid(input.bids, input.status);
  const own = vendorOwnBid(input.bids, input.vendorId);
  const outcome = vendorBidOutcome(input.status, input.awardedVendorId, input.vendorId);
  return {
    organizationName: input.organizationName,
    vendorName: input.vendorName,
    title: input.title,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
    budgetCents: input.budgetCents,
    neededBy: input.neededBy,
    endsAt: input.endsAt,
    status: input.status,
    awardedVendorId: input.awardedVendorId ?? null,
    outcome,
    leadingCents: lead?.amountCents ?? null,
    bidCount: participatingBidCount(input.bids, input.status),
    ownBid: own ? { amountCents: own.amountCents, source: own.source, status: own.status } : null,
    calendarConnected: input.calendarConnected,
    autobid: input.autobid,
    autobidBlocked: input.autobidBlocked,
    fieldUrl: outcome === "won" ? input.fieldUrl || null : null,
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const origin = new URL(request.url).origin;
  const demo = markDemoInviteViewed(token) || findDemoInvite(token);
  if (demo) {
    const vendor = demoVendors.find((row) => row.id === demo.invite.vendorId);
    const calendar = getDemoCalendar(demo.invite.vendorId);
    const autobid = getDemoAutobid(demo.invite.vendorId);
    const won = demo.opportunity.status === "awarded" && demo.opportunity.awardedVendorId === demo.invite.vendorId;
    const job = won
      ? ensureDemoJobSite({
          jobId: demo.opportunity.maintenanceRequestId,
          vendorId: demo.invite.vendorId,
          quotedAmountCents: vendorOwnBid(demo.opportunity.bids, demo.invite.vendorId)?.amountCents,
        })
      : getDemoJobByRequest(demo.opportunity.maintenanceRequestId);
    return NextResponse.json({
      mode: "demo",
      ...publicOpportunity({
        organizationName: "HomeOps Demo Management",
        vendorName: vendor?.name || "Vendor",
        title: demo.opportunity.title,
        city: demo.opportunity.city,
        state: demo.opportunity.state,
        postalCode: demo.opportunity.postalCode,
        budgetCents: demo.opportunity.budgetCents,
        neededBy: demo.opportunity.neededBy,
        endsAt: demo.opportunity.endsAt,
        status: demo.opportunity.status,
        awardedVendorId: demo.opportunity.awardedVendorId,
        vendorId: demo.invite.vendorId,
        bids: demo.opportunity.bids,
        calendarConnected: calendar.status === "connected",
        autobid,
        autobidBlocked: autobidBlockReason({ rule: autobid, calendar, neededBy: demo.opportunity.neededBy }),
        fieldUrl: won && job ? `${origin}${jobFieldPath(job.token)}` : null,
      }),
    });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Bidding is unavailable until the backend is connected." }, { status: 503 });
  const { data: invite } = await admin
    .from("vendor_bid_invites")
    .select("*, vendors(name), vendor_bid_opportunities(*, vendor_bids(*))")
    .eq("token", token)
    .maybeSingle();
  if (!invite) return NextResponse.json({ error: "This bid link is invalid." }, { status: 404 });
  const opportunity = Array.isArray(invite.vendor_bid_opportunities) ? invite.vendor_bid_opportunities[0] : invite.vendor_bid_opportunities;
  if (!opportunity) return NextResponse.json({ error: "This opportunity is no longer available." }, { status: 404 });
  const { data: org } = await admin.from("organizations").select("name").eq("id", invite.organization_id).maybeSingle();
  const vendorRow = Array.isArray(invite.vendors) ? invite.vendors[0] : invite.vendors;
  if (invite.status === "invited") {
    await admin.from("vendor_bid_invites").update({ status: "viewed", viewed_at: new Date().toISOString() }).eq("id", invite.id);
  }
  const [{ data: calendar }, { data: rule }] = await Promise.all([
    admin.from("vendor_calendar_connections").select("*").eq("vendor_id", invite.vendor_id).maybeSingle(),
    admin.from("vendor_autobid_rules").select("*").eq("vendor_id", invite.vendor_id).maybeSingle(),
  ]);
  const autobid = {
    enabled: Boolean(rule?.enabled),
    maxAmountCents: rule?.max_amount_cents ?? null,
    minAmountCents: rule?.min_amount_cents ?? null,
    undercutCents: rule?.undercut_cents ?? 2500,
    minNoticeHours: rule?.min_notice_hours ?? 4,
    jobDurationHours: rule?.job_duration_hours ?? 2,
  };
  const bids: AuctionBid[] = (opportunity.vendor_bids ?? []).map((bid: { id: string; vendor_id: string; amount_cents: number; source: AuctionBid["source"]; status: AuctionBid["status"] }) => ({
    id: bid.id,
    vendorId: bid.vendor_id,
    amountCents: bid.amount_cents,
    source: bid.source,
    status: bid.status,
  }));
  const { data: jobSite } = opportunity.status === "awarded" && opportunity.awarded_vendor_id === invite.vendor_id
    ? await admin.from("vendor_job_sites").select("token").eq("maintenance_request_id", opportunity.maintenance_request_id).maybeSingle()
    : { data: null };
  return NextResponse.json({
    mode: "live",
    ...publicOpportunity({
      organizationName: org?.name || "HomeOps",
      vendorName: vendorRow?.name || "Vendor",
      title: opportunity.title,
      city: opportunity.city,
      state: opportunity.state,
      postalCode: opportunity.postal_code,
      budgetCents: opportunity.budget_cents,
      neededBy: opportunity.needed_by,
      endsAt: opportunity.ends_at,
      status: opportunity.status,
      awardedVendorId: opportunity.awarded_vendor_id,
      vendorId: invite.vendor_id,
      bids,
      calendarConnected: calendar?.status === "connected",
      autobid,
      autobidBlocked: autobidBlockReason({ rule: autobid, calendar, neededBy: opportunity.needed_by }),
      fieldUrl: jobSite?.token ? `${new URL(request.url).origin}${jobFieldPath(jobSite.token)}` : null,
    }),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const amountCents = Math.round(Number(body.amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "Enter a bid greater than zero." }, { status: 400 });
  }
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const proposedStart = typeof body.proposedStart === "string" ? body.proposedStart : null;

  const demo = findDemoInvite(token);
  if (demo) {
    const result = placeDemoBid(token, { amountCents, notes, proposedStart });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ mode: "demo", bid: result.bid, leading: leadingBid(result.opportunity.bids) });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Bidding is unavailable until the backend is connected." }, { status: 503 });
  const { data: invite } = await admin
    .from("vendor_bid_invites")
    .select("*, vendor_bid_opportunities(*)")
    .eq("token", token)
    .maybeSingle();
  if (!invite) return NextResponse.json({ error: "This bid link is invalid." }, { status: 404 });
  const opportunity = Array.isArray(invite.vendor_bid_opportunities) ? invite.vendor_bid_opportunities[0] : invite.vendor_bid_opportunities;
  if (!opportunity || opportunity.status !== "open") return NextResponse.json({ error: "This auction is closed." }, { status: 409 });
  if (new Date(opportunity.ends_at) < new Date()) return NextResponse.json({ error: "This auction has ended." }, { status: 410 });

  const { data: bid, error } = await admin.from("vendor_bids").upsert({
    organization_id: invite.organization_id,
    opportunity_id: opportunity.id,
    vendor_id: invite.vendor_id,
    invite_id: invite.id,
    amount_cents: amountCents,
    proposed_start: proposedStart || opportunity.needed_by,
    notes: notes || null,
    source: "manual",
    status: "active",
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "opportunity_id,vendor_id" }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await admin.from("vendor_bid_invites").update({ status: "bid" }).eq("id", invite.id);
  await runLiveAutobid(admin, opportunity.id);
  return NextResponse.json({ mode: "live", bid });
}
