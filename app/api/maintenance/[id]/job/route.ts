import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { closeDemoJob, getDemoJobByRequest } from "@/lib/vendor-job-demo";
import { computeJobTiming, publicJob } from "@/lib/vendor-job";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, organizationId } = await getAuthedContext();
  const { id } = await params;
  const origin = new URL(request.url).origin;
  if (!supabase) {
    const job = getDemoJobByRequest(id);
    if (!job) return NextResponse.json({ mode: "demo", job: null, timing: null });
    return NextResponse.json({ mode: "demo", job: publicJob(job, origin), timing: computeJobTiming(job) });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const admin = createSupabaseAdminClient() || supabase;
  const { data: site } = await admin
    .from("vendor_job_sites")
    .select("*, vendors(name), maintenance_requests(title, homes(address1, city, state)), vendor_job_logs(*)")
    .eq("maintenance_request_id", id)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!site) return NextResponse.json({ mode: "live", job: null, timing: null });
  const home = Array.isArray(site.maintenance_requests?.homes) ? site.maintenance_requests.homes[0] : site.maintenance_requests?.homes;
  const logs = (site.vendor_job_logs ?? []).map((log: any) => ({
    id: log.id,
    kind: log.kind,
    body: log.body,
    mimeType: log.mime_type,
    fileName: log.file_name,
    createdAt: log.created_at,
  }));
  const job = {
    id: site.id,
    maintenanceRequestId: site.maintenance_request_id,
    vendorId: site.vendor_id,
    vendorName: site.vendors?.name || "Vendor",
    title: site.maintenance_requests?.title || "Job",
    address: home?.address1 || "",
    city: [home?.city, home?.state].filter(Boolean).join(", "),
    token: site.token,
    fieldUrl: `${origin}/vendors/job/${site.token}`,
    status: site.completed_at ? "completed" : site.arrived_at && !site.departed_at ? "on_site" : site.departed_at ? "departed" : "assigned",
    notifiedAt: site.notified_at,
    firstResponseAt: site.first_response_at,
    awardedAt: site.awarded_at,
    arrivedAt: site.arrived_at,
    departedAt: site.departed_at,
    completedAt: site.completed_at,
    locationConfirmed: site.location_confirmed,
    latitude: site.latitude,
    longitude: site.longitude,
    quotedAmountCents: site.quoted_amount_cents,
    logs,
  };
  return NextResponse.json({
    mode: "live",
    job: { ...job, timing: computeJobTiming({ ...job, logs: [] }) },
    timing: computeJobTiming({ ...job, logs: [] }),
  });
}

