import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { pickAutoAssignVendor } from "@/lib/auto-assign";
import { explainVendorEligibility } from "@/lib/vendors";
import { vendors as demoVendors } from "@/lib/vendor-demo";
import { getDemoMaintenance, updateDemoMaintenance } from "@/lib/maintenance-demo";
import { ensureDemoJobSite } from "@/lib/vendor-job-demo";
import { ensureLiveJobSite } from "@/lib/vendor-job-live";
import { jobFieldPath } from "@/lib/vendor-job";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, user, organizationId } = await getAuthedContext();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const budgetCents = body.budgetCents == null ? null : Math.round(Number(body.budgetCents));
  if (budgetCents != null && (!Number.isFinite(budgetCents) || budgetCents < 0)) {
    return NextResponse.json({ error: "Invalid budget" }, { status: 400 });
  }

  if (!supabase) {
    const job = getDemoMaintenance(id);
    if (!job) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    const approved = budgetCents ?? Math.round(job.estimate * 100);
    if (!approved) return NextResponse.json({ error: "Approve a budget before auto-assigning" }, { status: 409 });
    const { pick, skipped } = pickAutoAssignVendor({
      vendors: demoVendors.map((vendor) => ({
        ...vendor,
        eligibility: explainVendorEligibility(vendor),
      })),
      budgetCents: approved,
      emergency: job.priority === "Emergency",
      title: job.title,
    });
    if (!pick) {
      return NextResponse.json({
        error: "No eligible vendor fits this budget and job",
        skipped,
      }, { status: 409 });
    }
    const jobSite = ensureDemoJobSite({
      jobId: id,
      vendorId: pick.vendor.id,
      quotedAmountCents: approved,
    });
    updateDemoMaintenance(id, { status: "Dispatch", vendorId: pick.vendor.id, vendorName: pick.vendor.name, estimate: approved / 100 });
    return NextResponse.json({
      mode: "demo",
      assigned: true,
      vendor: { id: pick.vendor.id, name: pick.vendor.name },
      reasons: pick.reasons,
      impliedCostCents: pick.impliedCostCents,
      skipped,
      fieldUrl: `${new URL(request.url).origin}${jobFieldPath(jobSite.token)}`,
      message: "Demo auto-assign picked an eligible vendor. Crew job link is ready.",
    });
  }

  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const { data: job, error: jobError } = await supabase
    .from("maintenance_requests")
    .select("id,home_id,title,priority,status,estimated_cost_cents,approved_cost_cents,service_category_id,vendor_id")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();
  if (jobError || !job) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const approved = budgetCents ?? job.approved_cost_cents ?? job.estimated_cost_cents;
  if (!approved) return NextResponse.json({ error: "Approve a budget before auto-assigning" }, { status: 409 });

  const { data: vendorRows, error: vendorError } = await supabase
    .from("vendors")
    .select("*,vendor_credentials(*),vendor_services(*),vendor_owner_preferences(*),vendor_property_preferences(*)")
    .eq("organization_id", organizationId);
  if (vendorError) return NextResponse.json({ error: vendorError.message }, { status: 400 });

  const vendors = await Promise.all((vendorRows ?? []).map(async (vendor) => {
    const { data: eligibility, error: eligibilityError } = await supabase.rpc("vendor_eligibility", {
      v_id: vendor.id,
      p_home_id: job.home_id,
      p_service_category_id: job.service_category_id,
    });
    return {
      ...vendor,
      eligibility: eligibilityError
        ? explainVendorEligibility(vendor, { homeId: job.home_id, serviceCategoryId: job.service_category_id })
        : { ...explainVendorEligibility(vendor, { homeId: job.home_id, serviceCategoryId: job.service_category_id }), ...eligibility },
    };
  }));

  const { pick, skipped } = pickAutoAssignVendor({
    vendors,
    budgetCents: approved,
    emergency: job.priority === "emergency",
    title: job.title,
  });
  if (!pick) {
    return NextResponse.json({ error: "No eligible vendor fits this budget and job", skipped }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("maintenance_requests")
    .update({
      vendor_id: pick.vendor.id,
      status: "dispatch",
      approved_cost_cents: approved,
      auto_assign: true,
      assignment_method: "auto",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select("*, vendors(name)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from("activity_events").insert({
    organization_id: organizationId,
    home_id: job.home_id,
    subject_type: "maintenance_request",
    subject_id: id,
    event_type: "vendor_auto_assigned",
    body: `Auto-assigned ${pick.vendor.name} at approved budget ${(approved / 100).toFixed(0)}.`,
    metadata: { vendorId: pick.vendor.id, reasons: pick.reasons, impliedCostCents: pick.impliedCostCents },
  });
  const jobSite = await ensureLiveJobSite({
    supabase,
    organizationId,
    jobId: id,
    vendorId: pick.vendor.id,
    quotedAmountCents: approved,
  });

  return NextResponse.json({
    mode: "live",
    assigned: true,
    maintenance: data,
    vendor: { id: pick.vendor.id, name: pick.vendor.name },
    reasons: pick.reasons,
    impliedCostCents: pick.impliedCostCents,
    skipped,
    fieldUrl: `${new URL(request.url).origin}${jobFieldPath(jobSite.token)}`,
  });
}
