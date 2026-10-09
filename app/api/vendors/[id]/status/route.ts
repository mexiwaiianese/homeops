import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { getOperatorAdmin } from "@/lib/operator-admin";
import { getPlatformCatalog } from "@/lib/platform-catalog";
import { vendorStageOrder, isNetworkAdmin, type VendorApprovalStatus, type VendorWorkflowStage } from "@/lib/vendors";

const allowedStatuses: VendorApprovalStatus[] = ["preferred","approved","conditional","suspended","blocked"];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const platformAdmin = (await getOperatorAdmin()).allowed;
  const { supabase, user, organizationId, role } = await getAuthedContext();
  const { id } = await params;
  const body = await request.json();

  const db = platformAdmin ? await getPlatformCatalog() : null;
  if (platformAdmin && db && !db.ok) return NextResponse.json({ error: db.error }, { status: 400 });
  const client = platformAdmin && db && db.ok ? db.admin : supabase;
  const orgId = platformAdmin && db && db.ok ? db.organizationId : organizationId;
  if (!client || !orgId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!platformAdmin) {
    if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!isNetworkAdmin(role)) return NextResponse.json({ error: "Network admin required" }, { status: 403 });
  }

  const { data: current, error: readError } = platformAdmin
    ? await client.from("vendors").select("id,organization_id,workflow_stage,approval_status").eq("id", id).single()
    : await client.from("vendors").select("id,organization_id,workflow_stage,approval_status").eq("id", id).eq("organization_id", orgId).single();
  if (readError || !current) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  const vendorOrgId = current.organization_id as string;

  await client.rpc("refresh_vendor_eligibility", { v_id: id });
  const { data: refreshed } = await client.from("vendors").select("workflow_stage,approval_status").eq("id",id).single();
  const fromStage = (refreshed?.workflow_stage ?? current.workflow_stage) as VendorWorkflowStage;
  const fromStatus = (refreshed?.approval_status ?? current.approval_status) as VendorApprovalStatus;

  let toStage = (body.workflowStage ?? fromStage) as VendorWorkflowStage;
  let toStatus = (body.approvalStatus ?? fromStatus) as VendorApprovalStatus;

  if (!vendorStageOrder.includes(toStage) || !allowedStatuses.includes(toStatus)) {
    return NextResponse.json({ error: "Invalid workflow stage or approval status" }, { status: 400 });
  }

  if (toStage === "approved" || toStage === "monitored" || ["approved","preferred"].includes(toStatus)) {
    const { data: credentials } = await client.from("vendor_credentials")
      .select("credential_type,verification_status,expires_on")
      .eq("vendor_id", id).eq("organization_id", vendorOrgId);
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
  if (platformAdmin && (toStage === "prescreened" || (vendorOrgId === orgId && (toStage === "documents_reviewed" || toStage === "approved" || toStage === "monitored")))) {
    updates.catalog_released = true;
    updates.catalog_released_at = new Date().toISOString();
  }

  const { data, error } = await client.from("vendors").update(updates)
    .eq("id", id).eq("organization_id", vendorOrgId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await client.from("vendor_status_history").insert({
    organization_id: vendorOrgId,
    vendor_id: id,
    from_workflow_stage: fromStage,
    to_workflow_stage: toStage,
    from_approval_status: fromStatus,
    to_approval_status: toStatus,
    reason: body.reason || (platformAdmin ? "Platform qualification" : null),
    changed_by: user?.id ?? null,
    metadata: { source: platformAdmin ? "platform-admin" : "vendor-admin" },
  });

  return NextResponse.json({ vendor: data });
}
