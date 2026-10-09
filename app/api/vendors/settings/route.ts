import { NextResponse } from "next/server";
import { getDemoAutobid, getDemoCalendar, setDemoAutobid, setDemoCalendar, syncDemoInvites } from "@/lib/vendor-auction-demo";
import { vendors as demoVendors } from "@/lib/vendor-demo";
import {
  demoManagerHomes,
  demoSuccessfulJobs,
  getDemoGrants,
  getDemoNotify,
  setDemoNotify,
} from "@/lib/vendor-portal-demo";
import { accessSummary, normalizeAutobidInput, normalizeNotifyInput, settingsBidAccess } from "@/lib/vendor-portal";
import { missingPortalTable, requireVendorActor } from "@/lib/vendor-session";

function demoPayload(vendorId: string) {
  const vendor = demoVendors.find((row) => row.id === vendorId);
  const grants = getDemoGrants(vendorId);
  const access = settingsBidAccess({
    successfulJobs: demoSuccessfulJobs(vendorId),
    grants: grants.map((grant) => ({ managerName: grant.managerName })),
  });
  const homes = demoManagerHomes();
  return {
    mode: "demo" as const,
    vendor: vendor ? { id: vendor.id, name: vendor.name, trade: vendor.trade, services: vendor.services, emergencyAvailable: vendor.emergency_available } : { id: vendorId, services: [] },
    notifications: getDemoNotify(vendorId),
    autobid: getDemoAutobid(vendorId),
    calendar: getDemoCalendar(vendorId),
    access: { ...access, summary: accessSummary(access) },
    grants: grants.map((grant) => ({
      ...grant,
      properties: homes.filter((home) => grant.homeIds.includes(home.id)),
    })),
  };
}

export async function GET() {
  const actor = await requireVendorActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (actor.mode === "demo") return NextResponse.json(demoPayload(actor.vendorId));
  const { data: vendor } = await actor.admin.from("vendors").select("id, name, trade, emergency_available, vendor_services(specialty)").eq("id", actor.vendorId).maybeSingle();
  const services = ((vendor as any)?.vendor_services ?? []).map((row: { specialty?: string | null }) => row.specialty).filter(Boolean);
  const [{ data: notify }, { data: rule }, { data: calendar }] = await Promise.all([
    actor.admin.from("vendor_notification_rules").select("*").eq("vendor_id", actor.vendorId).maybeSingle(),
    actor.admin.from("vendor_autobid_rules").select("*").eq("vendor_id", actor.vendorId).maybeSingle(),
    actor.admin.from("vendor_calendar_connections").select("*").eq("vendor_id", actor.vendorId).maybeSingle(),
  ]);
  if (notify === null && rule === null) {
    const probe = await actor.admin.from("vendor_notification_rules").select("vendor_id").limit(0);
    if (probe.error && missingPortalTable(probe.error.message)) {
      return NextResponse.json({ error: "Vendor settings need the latest database migration (20260926120000_vendor_portal_controls.sql)." }, { status: 503 });
    }
  }
  const notifications = notify ? {
    enabled: notify.enabled !== false,
    services: notify.services?.length ? notify.services : services,
    minAmountCents: notify.min_amount_cents,
    maxAmountCents: notify.max_amount_cents,
    minNoticeHours: notify.min_notice_hours ?? 4,
    emergencyOnly: Boolean(notify.emergency_only),
    cities: notify.cities ?? [],
    states: notify.states ?? [],
  } : { enabled: true, services, minAmountCents: null, maxAmountCents: null, minNoticeHours: 4, emergencyOnly: false, cities: [], states: [] };
  return NextResponse.json({
    mode: "live",
    vendor: { id: actor.vendorId, name: vendor?.name, trade: vendor?.trade, services, emergencyAvailable: vendor?.emergency_available },
    notifications,
    autobid: {
      enabled: Boolean(rule?.enabled),
      maxAmountCents: rule?.max_amount_cents ?? null,
      minAmountCents: rule?.min_amount_cents ?? null,
      undercutCents: rule?.undercut_cents ?? 2500,
      minNoticeHours: rule?.min_notice_hours ?? 4,
      jobDurationHours: rule?.job_duration_hours ?? 2,
    },
    calendar: calendar || { status: "disconnected", provider: "demo" },
  });
}

export async function PATCH(request: Request) {
  const actor = await requireVendorActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = await request.json().catch(() => ({}));
  const origin = new URL(request.url).origin;

  if (actor.mode === "demo") {
    if (body.notifications) {
      const parsed = normalizeNotifyInput(body.notifications, getDemoNotify(actor.vendorId));
      if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
      setDemoNotify(actor.vendorId, parsed.rule);
    }
    if (body.autobid) {
      const parsed = normalizeAutobidInput(body.autobid, getDemoAutobid(actor.vendorId));
      if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
      setDemoAutobid(actor.vendorId, parsed.rule);
    }
    if (body.calendar === "connect" || body.calendar === "disconnect") {
      setDemoCalendar(actor.vendorId, body.calendar === "connect"
        ? { provider: "demo", status: "connected", connected_at: new Date().toISOString(), metadata: { busyBlocks: [] } }
        : { provider: "demo", status: "disconnected", connected_at: null, metadata: { busyBlocks: [] } });
    }
    await syncDemoInvites(origin);
    return NextResponse.json(demoPayload(actor.vendorId));
  }

  if (body.notifications) {
    const current = await actor.admin.from("vendor_notification_rules").select("*").eq("vendor_id", actor.vendorId).maybeSingle();
    const fallback = {
      enabled: current.data?.enabled !== false,
      services: current.data?.services ?? [],
      minAmountCents: current.data?.min_amount_cents ?? null,
      maxAmountCents: current.data?.max_amount_cents ?? null,
      minNoticeHours: current.data?.min_notice_hours ?? 4,
      emergencyOnly: Boolean(current.data?.emergency_only),
      cities: current.data?.cities ?? [],
      states: current.data?.states ?? [],
    };
    const parsed = normalizeNotifyInput(body.notifications, fallback);
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { error } = await actor.admin.from("vendor_notification_rules").upsert({
      vendor_id: actor.vendorId,
      organization_id: actor.organizationId,
      enabled: parsed.rule.enabled,
      services: parsed.rule.services,
      min_amount_cents: parsed.rule.minAmountCents,
      max_amount_cents: parsed.rule.maxAmountCents,
      min_notice_hours: parsed.rule.minNoticeHours,
      emergency_only: parsed.rule.emergencyOnly,
      cities: parsed.rule.cities,
      states: parsed.rule.states,
      updated_at: new Date().toISOString(),
    }, { onConflict: "vendor_id" });
    if (error) return NextResponse.json({ error: missingPortalTable(error.message) ? "Apply migration 20260926120000_vendor_portal_controls.sql, then save again." : error.message }, { status: 400 });
  }
  if (body.autobid) {
    const { data: current } = await actor.admin.from("vendor_autobid_rules").select("*").eq("vendor_id", actor.vendorId).maybeSingle();
    const parsed = normalizeAutobidInput(body.autobid, {
      enabled: Boolean(current?.enabled),
      maxAmountCents: current?.max_amount_cents ?? null,
      minAmountCents: current?.min_amount_cents ?? null,
      undercutCents: current?.undercut_cents ?? 2500,
      minNoticeHours: current?.min_notice_hours ?? 4,
      jobDurationHours: current?.job_duration_hours ?? 2,
    });
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { error } = await actor.admin.from("vendor_autobid_rules").upsert({
      organization_id: actor.organizationId,
      vendor_id: actor.vendorId,
      enabled: parsed.rule.enabled,
      max_amount_cents: parsed.rule.maxAmountCents,
      min_amount_cents: parsed.rule.minAmountCents,
      undercut_cents: parsed.rule.undercutCents,
      min_notice_hours: parsed.rule.minNoticeHours,
      job_duration_hours: parsed.rule.jobDurationHours,
      updated_at: new Date().toISOString(),
    }, { onConflict: "vendor_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (body.calendar === "connect" || body.calendar === "disconnect") {
    const connection = body.calendar === "connect"
      ? { provider: "demo", status: "connected", connected_at: new Date().toISOString(), metadata: { busyBlocks: [] } }
      : { provider: "demo", status: "disconnected", connected_at: null, metadata: { busyBlocks: [] } };
    const { error } = await actor.admin.from("vendor_calendar_connections").upsert({
      organization_id: actor.organizationId,
      vendor_id: actor.vendorId,
      ...connection,
      updated_at: new Date().toISOString(),
    }, { onConflict: "vendor_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return GET();
}
