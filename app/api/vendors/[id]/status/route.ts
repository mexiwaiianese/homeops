import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { vendorStageOrder, isNetworkAdmin, type VendorApprovalStatus, type VendorWorkflowStage } from "@/lib/vendors";

const allowedStatuses: VendorApprovalStatus[] = ["preferred","approved","conditional","suspended","blocked"];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, organizationId, role } = await getAuthedContext();
  if (!supabase || !user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!isNetworkAdmin(role)) return NextResponse.json({ error: "Network admin required" }, { status: 403 });
  const { id } = await params;
  const body = await request.json();

  const { data: current, error: readError } = await supabase.from("vendors")
    .select("id,workflow_stage,approval_status")
    .eq("id", id).eq("organization_id", organizationId).single();
  if (readError || !current) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

  await supabase.rpc("refresh_vendor_eligibility", { v_id: id });
  const { data: refreshed } = await supabase.from("vendors").select("workflow_stage,approval_status").eq("id",id).single();
  const fromStage = (refreshed?.workflow_stage ?? current.workflow_stage) as VendorWorkflowStage;
  const fromStatus = (refreshed?.approval_status ?? current.approval_status) as VendorApprovalStatus;

  let toStage = (body.workflowStage ?? fromStage) as VendorWorkflowStage;
  let toStatus = (body.approvalStatus ?? fromStatus) as VendorApprovalStatus;

  if (!vendorStageOrder.includes(toStage) || !allowedStatuses.includes(toStatus)) {
    return NextResponse.json({ error: "Invalid workflow stage or approval status" }, { status: 400 });
  }

  if (toStage === "approved" || toStage === "monitored" || ["approved","preferred"].includes(toStatus)) {
    const { data: credentials } = await supabase.from("vendor_credentials")
      .select("credential_type,verification_status,expires_on")
      .eq("vendor_id", id).eq("organization_id", organizationId);
    const blocking = (credentials ?? []).some((c:any) =>
      ["license","insurance_general_liability","insurance_workers_comp"].includes(c.credential_type) &&
      (["rejected","expired"].includes(c.verification_status) || (c.expires_on && new Date(c.expires_on+"T23:59:59Z").getTime() < Date.now()))
    );
    if (blocking) return NextResponse.json({ error: "Vendor cannot be approved while required credentials are expired or rejected" }, { status: 409 });
  }

  const updates:any = {
    workflow_stage: toStage,
    approval_status: toStatus,
    updated_at: new Date().toISOString(),
  };
  if (toStage === "application_submitted") updates.application_submitted_at = new Date().toISOString();
  if (toStage === "approved") updates.approved_at = new Date().toISOString();
  if (toStage === "suspended") updates.suspended_at = new Date().toISOString();
  if (toStage === "monitored") updates.last_monitored_at = new Date().toISOString();

  const { data, error } = await supabase.from("vendors").update(updates)
    .eq("id", id).eq("organization_id", organizationId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from("vendor_status_history").insert({
    organization_id: organizationId,
    vendor_id: id,
    from_workflow_stage: fromStage,
    to_workflow_stage: toStage,
    from_approval_status: fromStatus,
    to_approval_status: toStatus,
    reason: body.reason || null,
    changed_by: user.id,
    metadata: { source: "vendor-admin" },
  });

  return NextResponse.json({ vendor: data });
}
