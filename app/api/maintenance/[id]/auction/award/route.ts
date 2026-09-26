import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { awardDemoBid } from "@/lib/vendor-auction-demo";
import { vendors as demoVendors } from "@/lib/vendor-demo";
import { ensureDemoJobSite } from "@/lib/vendor-job-demo";
import { ensureLiveJobSite } from "@/lib/vendor-job-live";
import { jobFieldPath } from "@/lib/vendor-job";
import { updateDemoMaintenance } from "@/lib/maintenance-demo";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, organizationId } = await getAuthedContext();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const vendorId = String(body.vendorId || "");
  if (!vendorId) return NextResponse.json({ error: "vendorId is required" }, { status: 400 });

  if (!supabase) {
    const result = awardDemoBid(id, vendorId);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    const vendor = demoVendors.find((row) => row.id === vendorId);
    const job = ensureDemoJobSite({ jobId: id, vendorId, quotedAmountCents: result.bid.amountCents });
    updateDemoMaintenance(id, { status: "Dispatch", vendorId, vendorName: vendor?.name ?? null, estimate: result.bid.amountCents / 100 });
    const origin = new URL(request.url).origin;
    return NextResponse.json({
      mode: "demo",
      awarded: true,
      vendor: { id: vendorId, name: vendor?.name },
      amountCents: result.bid.amountCents,
      fieldUrl: `${origin}${jobFieldPath(job.token)}`,
    });
  }

  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { data: opportunity } = await supabase
    .from("vendor_bid_opportunities")
    .select("*")
    .eq("maintenance_request_id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!opportunity || opportunity.status !== "open") return NextResponse.json({ error: "No open auction" }, { status: 409 });
  const { data: bid } = await supabase
    .from("vendor_bids")
    .select("*")
    .eq("opportunity_id", opportunity.id)
    .eq("vendor_id", vendorId)
    .eq("status", "active")
    .maybeSingle();
  if (!bid) return NextResponse.json({ error: "Bid not found" }, { status: 404 });

  await supabase.from("vendor_bids").update({ status: "lost", updated_at: new Date().toISOString() })
    .eq("opportunity_id", opportunity.id).neq("id", bid.id).eq("status", "active");
  await supabase.from("vendor_bids").update({ status: "awarded", updated_at: new Date().toISOString() }).eq("id", bid.id);
  await supabase.from("vendor_bid_opportunities").update({
    status: "awarded",
    awarded_bid_id: bid.id,
    awarded_vendor_id: vendorId,
    awarded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", opportunity.id);
  const { data: maintenance, error } = await supabase.from("maintenance_requests").update({
    vendor_id: vendorId,
    status: "dispatch",
    assignment_method: "auction",
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("organization_id", organizationId).select("*, vendors(name)").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const job = await ensureLiveJobSite({
    supabase,
    organizationId,
    jobId: id,
    vendorId,
    quotedAmountCents: bid.amount_cents,
  });
  return NextResponse.json({
    mode: "live",
    awarded: true,
    maintenance,
    vendor: { id: vendorId, name: maintenance.vendors?.name },
    amountCents: bid.amount_cents,
    fieldUrl: `${new URL(request.url).origin}${jobFieldPath(job.token)}`,
  });
}
