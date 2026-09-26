import { NextResponse } from "next/server";
import { addDemoCrew, assignDemoCrew, listDemoCrew } from "@/lib/vendor-portal-demo";
import { listDemoJobsForVendor } from "@/lib/vendor-job-demo";
import { missingPortalTable, requireVendorActor } from "@/lib/vendor-session";

function demoCrewPayload(vendorId: string, origin: string) {
  const jobs = listDemoJobsForVendor(vendorId).map((job) => ({
    token: job.token,
    title: job.title,
    address: job.address,
    city: job.city,
    status: job.completedAt ? "completed" : job.departedAt ? "departed" : job.arrivedAt ? "on_site" : "assigned",
  }));
  return {
    mode: "demo" as const,
    jobs,
    crew: listDemoCrew(vendorId).map((member) => ({
      ...member,
      accessUrl: `${origin}/vendors/crew/${member.token}`,
    })),
  };
}

export async function GET(request: Request) {
  const actor = await requireVendorActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const origin = new URL(request.url).origin;
  if (actor.mode === "demo") return NextResponse.json(demoCrewPayload(actor.vendorId, origin));
  const [{ data, error }, { data: sites }] = await Promise.all([
    actor.admin.from("vendor_crew_members").select("*, vendor_crew_assignments(*)").eq("vendor_id", actor.vendorId),
    actor.admin.from("vendor_job_sites").select("token, maintenance_requests(title, homes(address1, city))").eq("vendor_id", actor.vendorId),
  ]);
  if (error) return NextResponse.json({ error: missingPortalTable(error.message) ? "Apply migration 20260926120000_vendor_portal_controls.sql." : error.message }, { status: error.code === "42P01" ? 503 : 400 });
  return NextResponse.json({
    mode: "live",
    jobs: (sites ?? []).map((row: any) => ({
      token: row.token,
      title: row.maintenance_requests?.title || "Job",
      address: row.maintenance_requests?.homes?.address1 || "",
      city: row.maintenance_requests?.homes?.city || "",
      status: "assigned",
    })),
    crew: (data ?? []).map((member: any) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      phone: member.phone,
      token: member.token,
      jobTokens: (member.vendor_crew_assignments ?? []).map((row: { job_token?: string }) => row.job_token).filter(Boolean),
      accessUrl: `${origin}/vendors/crew/${member.token}`,
    })),
  });
}

export async function POST(request: Request) {
  const actor = await requireVendorActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = await request.json().catch(() => ({}));
  const origin = new URL(request.url).origin;
  if (body.crewId && body.jobToken) {
    if (actor.mode === "demo") {
      const result = assignDemoCrew(actor.vendorId, String(body.crewId), String(body.jobToken), body.assign !== false);
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
      return NextResponse.json(demoCrewPayload(actor.vendorId, origin));
    }
    if (body.assign === false) {
      await actor.admin.from("vendor_crew_assignments").delete().eq("crew_member_id", body.crewId).eq("job_token", body.jobToken);
    } else {
      const { error } = await actor.admin.from("vendor_crew_assignments").insert({ crew_member_id: body.crewId, job_token: body.jobToken });
      if (error && !/duplicate/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return GET(request);
  }
  const email = String(body.email || "");
  const phone = String(body.phone || "");
  if (actor.mode === "demo") {
    const result = addDemoCrew(actor.vendorId, { name: body.name, email, phone });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(demoCrewPayload(actor.vendorId, origin));
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (phone.replace(/\D/g, "").length < 10) return NextResponse.json({ error: "Enter a cell phone number with at least 10 digits." }, { status: 400 });
  const { error } = await actor.admin.from("vendor_crew_members").insert({
    organization_id: actor.organizationId,
    vendor_id: actor.vendorId,
    name: String(body.name || email.split("@")[0]).trim(),
    email: email.trim().toLowerCase(),
    phone: phone.trim(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return GET(request);
}
