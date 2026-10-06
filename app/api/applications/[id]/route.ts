import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { appOrigin } from "@/lib/rent";
import { screeningProviderConfigured, type ScreeningStatus } from "@/lib/applications";
import { getDemoApplication, leaseDemoApplication, requestDemoScreening, setDemoScreening, updateDemoApplication } from "@/lib/application-demo";
import { getLiveApplication, leaseLiveApplication, liveApplicantPayUrl, rentSpreeRequestPatch, screeningPatch, updateLiveApplication } from "@/lib/application-live";
import { requestTenantLoginLink } from "@/lib/tenant-auth";
import { applicantPayLink, getDemoOrgSettings } from "@/lib/org-settings";

const decisions = new Set(["approved", "denied", "withdrawn", "screening"]);
const screeningResults = new Set(["not_started", "requested", "clear", "review", "fail"]);

// SCREENING_REQUEST_URL posts an application id and never receives a report.
// RentSpree applicant-pay does not use this hook.
async function requestProvider(applicationId: string) {
  const url = process.env.SCREENING_REQUEST_URL;
  const provider = process.env.SCREENING_PROVIDER;
  if (!url || !provider) return { manual: true as const };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.SCREENING_API_KEY ? { Authorization: `Bearer ${process.env.SCREENING_API_KEY}` } : {}),
    },
    body: JSON.stringify({ applicationId, provider }),
  });
  if (!response.ok) return { error: "The screening provider did not accept the request.", status: 502 as const };
  return { provider };
}

function demoPayUrl() {
  return applicantPayLink("demo", getDemoOrgSettings().rentspreeApplicantPayUrl);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  const { supabase, user, organizationId } = await getAuthedContext();

  if (!supabase) return demoPatch(id, action, body, request);
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const current = await getLiveApplication(supabase, organizationId, id);
  if (!current) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  if (action === "note") {
    const application = await updateLiveApplication(supabase, organizationId, id, { manager_notes: String(body.managerNotes || "").slice(0, 2000) });
    return NextResponse.json({ application });
  }
  if (action === "waive") {
    if (current.feeStatus === "paid") return NextResponse.json({ error: "The fee is already paid." }, { status: 409 });
    const application = await updateLiveApplication(supabase, organizationId, id, { fee_status: "waived" });
    return NextResponse.json({ application });
  }
  if (action === "request-screening") {
    const payUrl = await liveApplicantPayUrl(supabase, organizationId);
    if (!payUrl) return NextResponse.json({ error: "Add a RentSpree applicant-pay URL before requesting screening." }, { status: 400 });
    const application = await updateLiveApplication(
      supabase,
      organizationId,
      id,
      rentSpreeRequestPatch(current.screeningNotes, new Date().toISOString(), current.status),
    );
    return NextResponse.json({ application, screeningPayUrl: payUrl });
  }
  if (action === "screening") {
    const status = String(body.screeningStatus || "") as ScreeningStatus;
    if (!screeningResults.has(status)) return NextResponse.json({ error: "Choose a screening result." }, { status: 400 });
    const notes = body.notes ? String(body.notes).slice(0, 2000) : null;
    let provider: string | null = body.provider ? String(body.provider).slice(0, 80) : current.screeningProvider;
    const payUrl = status === "requested" ? await liveApplicantPayUrl(supabase, organizationId) : null;
    if (status === "requested" && payUrl) {
      const application = await updateLiveApplication(
        supabase,
        organizationId,
        id,
        rentSpreeRequestPatch(notes, new Date().toISOString(), current.status),
      );
      return NextResponse.json({ application, screeningPayUrl: payUrl });
    }
    if (status === "requested") {
      const sent = await requestProvider(id);
      if ("error" in sent) return NextResponse.json({ error: sent.error }, { status: sent.status });
      provider = "provider" in sent && sent.provider ? sent.provider : "manual";
    }
    const application = await updateLiveApplication(supabase, organizationId, id, screeningPatch(status, notes, provider));
    return NextResponse.json({ application, screening: payUrl ? "rentspree" : screeningProviderConfigured() ? "provider" : "manual" });
  }
  if (action === "decide") {
    const status = String(body.status || "");
    if (!decisions.has(status)) return NextResponse.json({ error: "Choose approved, denied, or withdrawn." }, { status: 400 });
    if (current.status === "leased") return NextResponse.json({ error: "This application already created a lease." }, { status: 409 });
    const application = await updateLiveApplication(supabase, organizationId, id, {
      status,
      manager_notes: body.managerNotes != null ? String(body.managerNotes).slice(0, 2000) : current.managerNotes,
      decided_at: new Date().toISOString(),
    });
    return NextResponse.json({ application });
  }
  if (action === "lease") {
    const result = await leaseLiveApplication(supabase, organizationId, id);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    const link = result.created
      ? await requestTenantLoginLink({ tenantId: result.tenantId, origin: appOrigin(request), requestedBy: user.id })
      : null;
    return NextResponse.json({ application: result.application, portal: link });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

async function demoPatch(id: string, action: string, body: Record<string, unknown>, request: Request) {
  const current = getDemoApplication(id);
  if (!current) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  if (action === "note") {
    return NextResponse.json({ application: updateDemoApplication(id, { managerNotes: String(body.managerNotes || "").slice(0, 2000) }) });
  }
  if (action === "waive") {
    if (current.feeStatus === "paid") return NextResponse.json({ error: "The fee is already paid." }, { status: 409 });
    return NextResponse.json({ application: updateDemoApplication(id, { feeStatus: "waived" }) });
  }
  if (action === "request-screening") {
    const payUrl = demoPayUrl();
    if (!payUrl) return NextResponse.json({ error: "Add a RentSpree applicant-pay URL before requesting screening." }, { status: 400 });
    const application = requestDemoScreening(id, new Date().toISOString());
    return NextResponse.json({ application, screeningPayUrl: payUrl });
  }
  if (action === "screening") {
    const status = String(body.screeningStatus || "") as ScreeningStatus;
    if (!screeningResults.has(status)) return NextResponse.json({ error: "Choose a screening result." }, { status: 400 });
    const notes = body.notes ? String(body.notes).slice(0, 2000) : null;
    const payUrl = status === "requested" ? demoPayUrl() : null;
    if (status === "requested" && payUrl) {
      const application = requestDemoScreening(id, new Date().toISOString());
      if (application && notes) application.screeningNotes = notes;
      return NextResponse.json({ application, screeningPayUrl: payUrl });
    }
    let provider: string | null = body.provider ? String(body.provider).slice(0, 80) : current.screeningProvider;
    if (status === "requested") {
      const sent = await requestProvider(id);
      if ("error" in sent) return NextResponse.json({ error: sent.error }, { status: sent.status });
      provider = "provider" in sent && sent.provider ? sent.provider : "manual";
    } else if (!provider) {
      provider = "manual";
    }
    return NextResponse.json({ application: setDemoScreening(id, status, notes, provider) });
  }
  if (action === "decide") {
    const status = String(body.status || "");
    if (!decisions.has(status)) return NextResponse.json({ error: "Choose approved, denied, or withdrawn." }, { status: 400 });
    if (current.status === "leased") return NextResponse.json({ error: "This application already created a lease." }, { status: 409 });
    return NextResponse.json({
      application: updateDemoApplication(id, {
        status: status as "approved" | "denied" | "withdrawn" | "screening",
        managerNotes: body.managerNotes != null ? String(body.managerNotes).slice(0, 2000) : current.managerNotes,
        decidedAt: new Date().toISOString(),
      }),
    });
  }
  if (action === "lease") {
    const result = leaseDemoApplication(id);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    const link = result.created && result.application.tenantId
      ? await requestTenantLoginLink({ tenantId: result.application.tenantId, origin: appOrigin(request) })
      : null;
    return NextResponse.json({ application: result.application, portal: link });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
