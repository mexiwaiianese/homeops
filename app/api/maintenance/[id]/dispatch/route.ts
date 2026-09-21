import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { ensureLiveJobSite } from "@/lib/vendor-job-live";
import { jobFieldPath } from "@/lib/vendor-job";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase || !user || !organizationId)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  const { id } = await params;
  const { vendorId } = await request.json();
  const { data: req } = await supabase
    .from("maintenance_requests")
    .select("home_id,service_category_id")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();
  const { data: v } = await supabase
    .from("vendors")
    .select(
      "*,vendor_credentials(*),vendor_services(*),vendor_owner_preferences(*),vendor_property_preferences(*)",
    )
    .eq("id", vendorId)
    .eq("organization_id", organizationId)
    .single();
  if (!req || !v)
    return NextResponse.json(
      { error: "Request or vendor not found" },
      { status: 404 },
    );
  const {data:eligibility,error:eligibilityError}=await supabase.rpc("vendor_eligibility",{v_id:v.id,p_home_id:req.home_id,p_service_category_id:req.service_category_id});
  if(eligibilityError)return NextResponse.json({error:eligibilityError.message},{status:400});
  if (!eligibility.eligible)
    return NextResponse.json(
      { error: "Vendor is not eligible", reasons: eligibility.reasons },
      { status: 409 },
    );
  const { data, error } = await supabase
    .from("maintenance_requests")
    .update({ vendor_id: vendorId, status: "dispatch", assignment_method: "manual", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const jobSite = await ensureLiveJobSite({ supabase, organizationId, jobId: id, vendorId });
  return NextResponse.json({
    maintenance: data,
    eligibility,
    fieldUrl: `${new URL(request.url).origin}${jobFieldPath(jobSite.token)}`,
  });
}
