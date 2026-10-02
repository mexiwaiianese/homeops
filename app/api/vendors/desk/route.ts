import { NextResponse } from "next/server";
import { listDemoJobsForVendor } from "@/lib/vendor-job-demo";
import { publicJob } from "@/lib/vendor-job";
import { requireVendorActor } from "@/lib/vendor-session";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const actor = await requireVendorActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (actor.mode === "demo") {
    const jobs = listDemoJobsForVendor(actor.vendorId).map((job) => publicJob(job, origin));
    return NextResponse.json({ mode: "demo", jobs });
  }
  const { data: sites, error } = await actor.admin
    .from("vendor_job_sites")
    .select("*, vendors(name), maintenance_requests(title, status, homes(address1, city, state))")
    .eq("vendor_id", actor.vendorId)
    .order("awarded_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({
    mode: "live",
    jobs: (sites ?? []).map((row: any) => ({
      id: row.id,
      maintenanceRequestId: row.maintenance_request_id,
      vendorId: row.vendor_id,
      vendorName: row.vendors?.name,
      title: row.maintenance_requests?.title,
      address: row.maintenance_requests?.homes?.address1,
      city: [row.maintenance_requests?.homes?.city, row.maintenance_requests?.homes?.state].filter(Boolean).join(", "),
      token: row.token,
      fieldUrl: `${origin}/vendors/job/${row.token}`,
      status: row.completed_at ? "completed" : row.arrived_at && !row.departed_at ? "on_site" : row.departed_at ? "departed" : "assigned",
      awardedAt: row.awarded_at,
      arrivedAt: row.arrived_at,
      departedAt: row.departed_at,
      completedAt: row.completed_at,
    })),
  });
}
