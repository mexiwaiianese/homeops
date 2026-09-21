import { NextResponse } from "next/server";
import { addDemoJobMedia, getDemoJobByToken, recordDemoJobAction } from "@/lib/vendor-job-demo";
import { allowedJobMedia, publicJob } from "@/lib/vendor-job";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function originOf(request: Request) {
  return new URL(request.url).origin;
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const demo = getDemoJobByToken(token);
  if (demo) return NextResponse.json({ mode: "demo", job: publicJob(demo, originOf(request)) });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "This job link is not valid." }, { status: 404 });
  const { data: site } = await admin
    .from("vendor_job_sites")
    .select("*, vendors(name), maintenance_requests(title, homes(address1, city, state)), vendor_job_logs(*)")
    .eq("token", token)
    .maybeSingle();
  if (!site) return NextResponse.json({ error: "This job link is not valid." }, { status: 404 });
  const logs = await Promise.all((site.vendor_job_logs ?? []).map(async (log: any) => {
    let url = null;
    if (log.storage_path) {
      const signed = await admin.storage.from(log.storage_bucket || "vendor-job-media").createSignedUrl(log.storage_path, 60 * 30);
      url = signed.data?.signedUrl || null;
    }
    return {
      id: log.id,
      kind: log.kind,
      body: log.body,
      mimeType: log.mime_type,
      fileName: log.file_name,
      url,
      latitude: log.latitude,
      longitude: log.longitude,
      createdAt: log.created_at,
    };
  }));
  const home = Array.isArray(site.maintenance_requests?.homes) ? site.maintenance_requests.homes[0] : site.maintenance_requests?.homes;
  const job = {
    id: site.id,
    maintenanceRequestId: site.maintenance_request_id,
    vendorId: site.vendor_id,
    vendorName: site.vendors?.name || "Vendor",
    title: site.maintenance_requests?.title || "Job",
    address: home?.address1 || "",
    city: [home?.city, home?.state].filter(Boolean).join(", "),
    token: site.token,
    fieldUrl: `${originOf(request)}/vendors/job/${site.token}`,
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
  return NextResponse.json({ mode: "live", job });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action as "arrive" | "leave" | "confirm" | "note";
  if (!["arrive", "leave", "confirm", "note"].includes(action)) {
    return NextResponse.json({ error: "Unknown job action." }, { status: 400 });
  }
  const demo = getDemoJobByToken(token);
  if (demo) {
    const result = recordDemoJobAction(token, {
      action,
      note: body.note,
      latitude: body.latitude == null ? null : Number(body.latitude),
      longitude: body.longitude == null ? null : Number(body.longitude),
      confirmed: Boolean(body.confirmed),
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ mode: "demo", job: publicJob(result.job, originOf(request)) });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "This job link is not valid." }, { status: 404 });
  const { data: site } = await admin.from("vendor_job_sites").select("*").eq("token", token).maybeSingle();
  if (!site) return NextResponse.json({ error: "This job link is not valid." }, { status: 404 });
  if (site.completed_at) return NextResponse.json({ error: "This job is already closed." }, { status: 409 });
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };
  let kind = action;
  let logBody = body.note || null;
  if (action === "arrive") {
    if (site.arrived_at && !site.departed_at) return NextResponse.json({ error: "Crew is already marked on site." }, { status: 409 });
    updates.arrived_at = site.arrived_at || now;
    updates.departed_at = null;
    if (body.latitude != null) updates.latitude = Number(body.latitude);
    if (body.longitude != null) updates.longitude = Number(body.longitude);
    logBody = "Crew marked arrival.";
  } else if (action === "confirm") {
    if (!site.arrived_at) return NextResponse.json({ error: "Mark arrival before confirming the location." }, { status: 409 });
    updates.location_confirmed = true;
    logBody = "Confirmed on site.";
  } else if (action === "leave") {
    if (!site.arrived_at) return NextResponse.json({ error: "Mark arrival before leaving." }, { status: 409 });
    if (site.departed_at) return NextResponse.json({ error: "Crew already marked departure." }, { status: 409 });
    updates.departed_at = now;
    logBody = "Crew marked departure.";
  } else if (!String(body.note || "").trim()) {
    return NextResponse.json({ error: "Enter a note." }, { status: 400 });
  }
  await admin.from("vendor_job_sites").update(updates).eq("id", site.id);
  await admin.from("vendor_job_logs").insert({
    organization_id: site.organization_id,
    job_site_id: site.id,
    vendor_id: site.vendor_id,
    kind,
    body: logBody,
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
  });
  return GET(request, { params: Promise.resolve({ token }) });
}

export async function PUT(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a photo, video, or audio file." }, { status: 400 });
  const blocked = allowedJobMedia(file);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 400 });
  const caption = typeof form.get("caption") === "string" ? String(form.get("caption")).trim() : "";

  const demo = getDemoJobByToken(token);
  if (demo) {
    const buf = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type || "application/octet-stream"};base64,${buf.toString("base64")}`;
    const result = addDemoJobMedia(token, {
      mimeType: file.type,
      fileName: file.name,
      dataUrl,
      body: caption || file.name,
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ mode: "demo", job: publicJob(result.job, originOf(request)) });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "This job link is not valid." }, { status: 404 });
  const { data: site } = await admin.from("vendor_job_sites").select("*").eq("token", token).maybeSingle();
  if (!site) return NextResponse.json({ error: "This job link is not valid." }, { status: 404 });
  if (site.completed_at) return NextResponse.json({ error: "This job is already closed." }, { status: 409 });
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${site.organization_id}/${site.id}/${crypto.randomUUID()}-${safe}`;
  const { error: uploadError } = await admin.storage.from("vendor-job-media").upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 });
  const { mediaKind } = await import("@/lib/vendor-job");
  await admin.from("vendor_job_logs").insert({
    organization_id: site.organization_id,
    job_site_id: site.id,
    vendor_id: site.vendor_id,
    kind: mediaKind(file.type) || "photo",
    body: caption || file.name,
    mime_type: file.type,
    file_name: file.name,
    storage_path: path,
  });
  return GET(request, { params: Promise.resolve({ token }) });
}
