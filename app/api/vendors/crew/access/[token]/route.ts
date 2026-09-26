import { NextResponse } from "next/server";
import { getDemoCrewByToken } from "@/lib/vendor-portal-demo";
import { getDemoJobByToken } from "@/lib/vendor-job-demo";
import { publicJob } from "@/lib/vendor-job";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const origin = new URL(request.url).origin;
  const demo = getDemoCrewByToken(token);
  if (demo) {
    const jobs = demo.jobTokens
      .map((jobToken) => getDemoJobByToken(jobToken))
      .filter((job): job is NonNullable<typeof job> => Boolean(job))
      .map((job) => publicJob(job, origin));
    return NextResponse.json({
      mode: "demo",
      crew: { name: demo.name, companyId: demo.vendorId },
      jobs,
    });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "This crew link is not valid." }, { status: 404 });
  const { data: member } = await admin.from("vendor_crew_members").select("*, vendor_crew_assignments(*), vendors(name)").eq("token", token).maybeSingle();
  if (!member) return NextResponse.json({ error: "This crew link is not valid." }, { status: 404 });
  const tokens = ((member as any).vendor_crew_assignments ?? []).map((row: { job_token?: string }) => row.job_token).filter(Boolean);
  const { data: sites } = tokens.length
    ? await admin.from("vendor_job_sites").select("*, maintenance_requests(title, homes(address1, city, state))").in("token", tokens)
    : { data: [] };
  return NextResponse.json({
    mode: "live",
    crew: { name: member.name },
    jobs: (sites ?? []).map((row: any) => ({
      title: row.maintenance_requests?.title,
      address: row.maintenance_requests?.homes?.address1,
      city: [row.maintenance_requests?.homes?.city, row.maintenance_requests?.homes?.state].filter(Boolean).join(", "),
      status: row.completed_at ? "completed" : row.departed_at ? "departed" : row.arrived_at ? "on_site" : "assigned",
      fieldUrl: `${origin}/vendors/job/${row.token}`,
      arrivedAt: row.arrived_at,
      departedAt: row.departed_at,
      completedAt: row.completed_at,
    })),
  });
}
