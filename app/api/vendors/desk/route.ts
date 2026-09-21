import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthedContext } from "@/lib/backend";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { demoVendorSessionCookie, listDemoJobsForVendor } from "@/lib/vendor-job-demo";
import { publicJob } from "@/lib/vendor-job";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const { supabase, user } = await getAuthedContext();
  if (!supabase) {
    const vendorId = (await cookies()).get(demoVendorSessionCookie)?.value;
    if (!vendorId) return NextResponse.json({ error: "Sign in to the vendor desk." }, { status: 401 });
    const jobs = listDemoJobsForVendor(vendorId).map((job) => publicJob(job, origin));
    return NextResponse.json({ mode: "demo", jobs });
  }
  if (!user) return NextResponse.json({ error: "Sign in to the vendor desk." }, { status: 401 });
  const admin = createSupabaseAdminClient() || supabase;
  const { data: vendorUser } = await admin.from("vendor_users").select("vendor_id, organization_id").eq("auth_user_id", user.id).maybeSingle();
  if (!vendorUser) return NextResponse.json({ error: "This login is not linked to a vendor company." }, { status: 403 });
  const { data: sites, error } = await admin
    .from("vendor_job_sites")
    .select("*, vendors(name), maintenance_requests(title, status, homes(address1, city, state))")
    .eq("vendor_id", vendorUser.vendor_id)
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
