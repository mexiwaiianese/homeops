import { NextResponse } from "next/server";
import { crewDeliverySummary, notifyCrewAssignment, notifyCrewLink, type CrewLinkDelivery } from "@/lib/vendor-crew-notify";
import { vendors as demoVendors } from "@/lib/vendor-demo";
import { getDemoJobByToken, listDemoJobsForVendor } from "@/lib/vendor-job-demo";
import { addDemoCrew, assignDemoCrew, getDemoCrew, listDemoCrew, recordDemoCrewSend, removeDemoCrew, updateDemoCrew } from "@/lib/vendor-portal-demo";
import { missingPortalTable, requireVendorActor } from "@/lib/vendor-session";

type Actor = Exclude<Awaited<ReturnType<typeof requireVendorActor>>, { error: string }>;

function crewUrl(origin: string, token: string) {
  return `${origin}/vendors/crew/${token}`;
}

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
      active: !member.deactivatedAt,
      accessUrl: crewUrl(origin, member.token),
      linkSentAt: member.linkSentAt ?? null,
      linkSummary: member.linkSentAt
        ? crewDeliverySummary({ channel: member.linkChannel ?? null, sentTo: member.linkSentTo ?? null, sent: !member.linkDeliveryError, provider: "demo", error: member.linkDeliveryError })
        : null,
    })),
  };
}

async function liveCrewPayload(actor: Actor & { mode: "live" }, origin: string) {
  const [{ data, error }, { data: sites }] = await Promise.all([
    actor.admin.from("vendor_crew_members").select("*, vendor_crew_assignments(*)").eq("vendor_id", actor.vendorId).order("created_at"),
    actor.admin.from("vendor_job_sites").select("token, arrived_at, departed_at, completed_at, maintenance_requests(title, homes(address1, city))").eq("vendor_id", actor.vendorId),
  ]);
  if (error) {
    return { error: missingPortalTable(error.message) ? "Apply migration 20260926120000_vendor_portal_controls.sql." : error.message, status: error.code === "42P01" ? 503 : 400 };
  }
  return {
    mode: "live" as const,
    jobs: (sites ?? []).map((row: any) => ({
      token: row.token,
      title: row.maintenance_requests?.title || "Job",
      address: row.maintenance_requests?.homes?.address1 || "",
      city: row.maintenance_requests?.homes?.city || "",
      status: row.completed_at ? "completed" : row.departed_at ? "departed" : row.arrived_at ? "on_site" : "assigned",
    })),
    crew: (data ?? []).map((member: any) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      phone: member.phone,
      token: member.token,
      jobTokens: (member.vendor_crew_assignments ?? []).map((row: { job_token?: string }) => row.job_token).filter(Boolean),
      accessUrl: crewUrl(origin, member.token),
      active: !member.deactivated_at,
      deactivatedAt: member.deactivated_at ?? null,
      linkSentAt: member.link_sent_at ?? null,
      linkSummary: member.link_sent_at
        ? crewDeliverySummary({ channel: member.link_channel ?? null, sentTo: member.link_sent_to ?? null, sent: !member.link_delivery_error, provider: "live", error: member.link_delivery_error })
        : null,
    })),
  };
}

async function vendorName(actor: Actor) {
  if (actor.mode === "demo") return demoVendors.find((row) => row.id === actor.vendorId)?.name || "Your company";
  const { data } = await actor.admin.from("vendors").select("name").eq("id", actor.vendorId).maybeSingle();
  return data?.name || "Your company";
}

/** Send the crew link and remember the outcome on the member. Never throws; the desk shows the result. */
async function sendCrewLink(actor: Actor, crewId: string, origin: string): Promise<{ delivery: CrewLinkDelivery } | { error: string; status: number }> {
  const company = await vendorName(actor);
  if (actor.mode === "demo") {
    const member = getDemoCrew(actor.vendorId, crewId);
    if (!member) return { error: "Crew member not found.", status: 404 };
    const delivery = await notifyCrewLink({ email: member.email, phone: member.phone, vendorName: company, crewName: member.name, url: crewUrl(origin, member.token), jobCount: member.jobTokens.length });
    recordDemoCrewSend(actor.vendorId, crewId, delivery);
    return { delivery };
  }
  const { data: member } = await actor.admin
    .from("vendor_crew_members")
    .select("id, name, email, phone, token, vendor_crew_assignments(id)")
    .eq("id", crewId)
    .eq("vendor_id", actor.vendorId)
    .maybeSingle();
  if (!member) return { error: "Crew member not found.", status: 404 };
  const delivery = await notifyCrewLink({
    email: member.email,
    phone: member.phone,
    vendorName: company,
    crewName: member.name,
    url: crewUrl(origin, member.token),
    jobCount: ((member as any).vendor_crew_assignments ?? []).length,
  });
  // Delivery columns arrived with 20260927090000_vendor_crew_link_sends.sql; older schemas still send the link.
  await actor.admin.from("vendor_crew_members").update({
    link_sent_at: new Date().toISOString(),
    link_channel: delivery.channel,
    link_sent_to: delivery.sentTo,
    link_delivery_error: delivery.sent ? null : delivery.error || "Link was not delivered",
  }).eq("id", member.id);
  return { delivery };
}

function rememberDelivery(actor: Actor, crewId: string, delivery: CrewLinkDelivery) {
  if (actor.mode === "demo") {
    recordDemoCrewSend(actor.vendorId, crewId, delivery);
    return;
  }
  return actor.admin.from("vendor_crew_members").update({
    link_sent_at: new Date().toISOString(),
    link_channel: delivery.channel,
    link_sent_to: delivery.sentTo,
    link_delivery_error: delivery.sent ? null : delivery.error || "Link was not delivered",
  }).eq("id", crewId);
}

/** Text and email a crew member that they were just put on one job. The link opens that job. */
async function sendCrewAssignment(actor: Actor, crewId: string, jobToken: string, origin: string): Promise<CrewLinkDelivery | null> {
  const company = await vendorName(actor);
  if (actor.mode === "demo") {
    const member = getDemoCrew(actor.vendorId, crewId);
    const job = getDemoJobByToken(jobToken);
    if (!member || !job || job.vendorId !== actor.vendorId) return null;
    const delivery = await notifyCrewAssignment({
      email: member.email,
      phone: member.phone,
      vendorName: company,
      crewName: member.name,
      title: job.title,
      address: [job.address, job.city].filter(Boolean).join(", "),
      url: `${crewUrl(origin, member.token)}?job=${encodeURIComponent(jobToken)}`,
    });
    rememberDelivery(actor, crewId, delivery);
    return delivery;
  }
  const [{ data: member }, { data: site }] = await Promise.all([
    actor.admin.from("vendor_crew_members").select("id, name, email, phone, token").eq("id", crewId).eq("vendor_id", actor.vendorId).maybeSingle(),
    actor.admin.from("vendor_job_sites").select("token, maintenance_requests(title, homes(address1, city))").eq("token", jobToken).eq("vendor_id", actor.vendorId).maybeSingle(),
  ]);
  if (!member) return null;
  const request = (site as { maintenance_requests?: { title?: string; homes?: { address1?: string; city?: string } } } | null)?.maintenance_requests;
  const delivery = await notifyCrewAssignment({
    email: member.email,
    phone: member.phone,
    vendorName: company,
    crewName: member.name,
    title: request?.title || "a job",
    address: [request?.homes?.address1, request?.homes?.city].filter(Boolean).join(", "),
    url: `${crewUrl(origin, member.token)}?job=${encodeURIComponent(jobToken)}`,
  });
  await rememberDelivery(actor, member.id, delivery);
  return delivery;
}

async function payload(actor: Actor, origin: string) {
  if (actor.mode === "demo") return demoCrewPayload(actor.vendorId, origin);
  return liveCrewPayload(actor, origin);
}

function respond(body: Awaited<ReturnType<typeof payload>>, extra: Record<string, unknown> = {}) {
  if ("error" in body) return NextResponse.json({ error: body.error }, { status: body.status });
  return NextResponse.json({ ...body, ...extra });
}

export async function GET(request: Request) {
  const actor = await requireVendorActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const origin = new URL(request.url).origin;
  return respond(await payload(actor, origin));
}

export async function POST(request: Request) {
  const actor = await requireVendorActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = await request.json().catch(() => ({}));
  const origin = new URL(request.url).origin;

  // Edit, deactivate, or delete a crew member.
  if (body.crewId && (body.action === "update" || body.action === "deactivate" || body.action === "delete")) {
    const crewId = String(body.crewId);
    if (actor.mode === "demo") {
      if (body.action === "delete") {
        const result = removeDemoCrew(actor.vendorId, crewId);
        if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
      } else {
        const result = updateDemoCrew(actor.vendorId, crewId, {
          name: body.name,
          email: body.email,
          phone: body.phone,
          active: body.action === "deactivate" ? false : body.active,
        });
        if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return respond(await payload(actor, origin));
    }
    if (body.action === "delete") {
      await actor.admin.from("vendor_crew_assignments").delete().eq("crew_member_id", crewId);
      const { error } = await actor.admin.from("vendor_crew_members").delete().eq("id", crewId).eq("vendor_id", actor.vendorId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return respond(await payload(actor, origin));
    }
    const patch: Record<string, unknown> = {};
    if (body.name != null) patch.name = String(body.name).trim();
    if (body.email != null) patch.email = String(body.email).trim().toLowerCase();
    if (body.phone != null) patch.phone = String(body.phone).trim();
    if (body.action === "deactivate") patch.deactivated_at = new Date().toISOString();
    if (body.active === true) patch.deactivated_at = null;
    const { error } = await actor.admin.from("vendor_crew_members").update(patch).eq("id", crewId).eq("vendor_id", actor.vendorId);
    if (error) return NextResponse.json({ error: missingPortalTable(error.message) ? "Apply the crew follow-up migration." : error.message }, { status: 400 });
    return respond(await payload(actor, origin));
  }

  // Manual resend of the crew link.
  if (body.crewId && body.action === "send") {
    const result = await sendCrewLink(actor, String(body.crewId), origin);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return respond(await payload(actor, origin), { delivery: result.delivery });
  }

  // Put a crew member on or off a job. A new assignment texts and emails them that job.
  if (body.crewId && body.jobToken) {
    const crewId = String(body.crewId);
    const jobToken = String(body.jobToken);
    const assigning = body.assign !== false;
    if (actor.mode === "demo") {
      const member = getDemoCrew(actor.vendorId, crewId);
      if (!member) return NextResponse.json({ error: "Crew member not found." }, { status: 404 });
      const already = member.jobTokens.includes(jobToken);
      const result = assignDemoCrew(actor.vendorId, crewId, jobToken, assigning);
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
      const delivery = assigning && !already ? await sendCrewAssignment(actor, crewId, jobToken, origin) : null;
      return respond(demoCrewPayload(actor.vendorId, origin), delivery ? { delivery } : {});
    }
    if (!assigning) {
      await actor.admin.from("vendor_crew_assignments").delete().eq("crew_member_id", crewId).eq("job_token", jobToken);
      return respond(await payload(actor, origin));
    }
    const { error } = await actor.admin.from("vendor_crew_assignments").insert({ crew_member_id: crewId, job_token: jobToken });
    if (error && !/duplicate/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 400 });
    const delivery = error ? null : await sendCrewAssignment(actor, crewId, jobToken, origin);
    return respond(await payload(actor, origin), delivery ? { delivery } : {});
  }

  // Add a crew member, then send them their link right away.
  const email = String(body.email || "");
  const phone = String(body.phone || "");
  let crewId: string;
  if (actor.mode === "demo") {
    const result = addDemoCrew(actor.vendorId, { name: body.name, email, phone });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    crewId = result.member.id;
  } else {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (phone.replace(/\D/g, "").length < 10) return NextResponse.json({ error: "Enter a cell phone number with at least 10 digits." }, { status: 400 });
    const { data, error } = await actor.admin
      .from("vendor_crew_members")
      .insert({
        organization_id: actor.organizationId,
        vendor_id: actor.vendorId,
        name: String(body.name || email.split("@")[0]).trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
      })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message || "Could not add this person." }, { status: 400 });
    crewId = data.id;
  }
  const sent = await sendCrewLink(actor, crewId, origin);
  return respond(await payload(actor, origin), { added: crewId, delivery: "delivery" in sent ? sent.delivery : null });
}
