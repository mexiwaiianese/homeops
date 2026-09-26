import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { getDemoOpportunityByJob, openDemoAuction, cancelDemoAuction } from "@/lib/vendor-auction-demo";
import { leadingBid } from "@/lib/vendor-auction";
import { openLiveAuction } from "@/lib/vendor-auction-live";
import { getDemoMaintenance, updateDemoMaintenance } from "@/lib/maintenance-demo";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, organizationId } = await getAuthedContext();
  const { id } = await params;
  if (!supabase) {
    const opportunity = getDemoOpportunityByJob(id);
    if (!opportunity) return NextResponse.json({ mode: "demo", opportunity: null });
    return NextResponse.json({
      mode: "demo",
      opportunity,
      leading: leadingBid(opportunity.bids),
    });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { data, error } = await supabase
    .from("vendor_bid_opportunities")
    .select("*, vendor_bid_invites(*, vendors(id,name,email,phone)), vendor_bids(*, vendors(id,name))")
    .eq("maintenance_request_id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const bids = (data?.vendor_bids ?? []).map((bid: any) => ({
    id: bid.id,
    vendorId: bid.vendor_id,
    vendorName: bid.vendors?.name,
    amountCents: bid.amount_cents,
    source: bid.source,
    status: bid.status,
    proposedStart: bid.proposed_start,
    notes: bid.notes,
    submittedAt: bid.submitted_at,
  }));
  return NextResponse.json({
    mode: "live",
    opportunity: data,
    leading: leadingBid(bids),
    bids,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, organizationId } = await getAuthedContext();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const budgetCents = body.budgetCents == null || body.budgetCents === "" ? null : Math.round(Number(body.budgetCents));
  if (budgetCents != null && (!Number.isFinite(budgetCents) || budgetCents < 0)) {
    return NextResponse.json({ error: "Invalid budget" }, { status: 400 });
  }
  const neededBy = typeof body.neededBy === "string" && body.neededBy ? body.neededBy : null;
  const origin = new URL(request.url).origin;
  const publishedBudget = budgetCents != null && budgetCents > 0 ? budgetCents : null;

  if (!supabase) {
    const job = getDemoMaintenance(id);
    if (!job) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    if (publishedBudget != null) updateDemoMaintenance(id, { estimate: publishedBudget / 100 });
    const opened = await openDemoAuction({
      jobId: id,
      budgetCents: publishedBudget ?? (job.estimate ? Math.round(job.estimate * 100) : null),
      neededBy,
      origin,
    });
    return NextResponse.json({
      mode: "demo",
      created: opened.created,
      opportunity: opened.opportunity,
      invited: opened.opportunity.invites.length,
      leading: leadingBid(opened.opportunity.bids),
      message: !opened.opportunity.invites.length
        ? "Auction opened, but no eligible vendors matched this job."
        : opened.opportunity.invites.some((invite) => invite.deliveryError)
          ? "Auction opened. Bid links are ready; connect email/SMS to notify vendors."
          : "Auction opened and eligible vendors were notified.",
    });
  }

  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { data: job } = await supabase
    .from("maintenance_requests")
    .select("id,home_id,title,description,priority,estimated_cost_cents,approved_cost_cents,service_category_id,status")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();
  if (!job) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  const { data: org } = await supabase.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  const approvedRaw = publishedBudget ?? job.approved_cost_cents ?? job.estimated_cost_cents ?? null;
  const approved = approvedRaw && approvedRaw > 0 ? approvedRaw : null;
  await supabase.from("maintenance_requests").update({
    approved_cost_cents: approved,
    auto_assign: false,
    assignment_method: "auction",
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  const opened = await openLiveAuction({
    supabase,
    organizationId,
    organizationName: org?.name || "HomeOps",
    job,
    budgetCents: approved,
    neededBy,
    origin,
    userId: user.id,
  });
  return NextResponse.json({ mode: "live", ...opened });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, organizationId } = await getAuthedContext();
  const { id } = await params;
  if (!supabase) {
    const result = cancelDemoAuction(id);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ mode: "demo", cancelled: true, opportunity: result.opportunity });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { data: opportunity } = await supabase
    .from("vendor_bid_opportunities")
    .select("id,status")
    .eq("maintenance_request_id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!opportunity || opportunity.status !== "open") return NextResponse.json({ error: "No open auction" }, { status: 409 });
  const { error } = await supabase.from("vendor_bid_opportunities").update({
    status: "cancelled",
    updated_at: new Date().toISOString(),
  }).eq("id", opportunity.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await supabase.from("maintenance_requests").update({
    assignment_method: null,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("organization_id", organizationId);
  return NextResponse.json({ mode: "live", cancelled: true });
}
