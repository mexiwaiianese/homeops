import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { isNetworkAdmin } from "@/lib/vendors";
import { getDemoAutobid, setDemoAutobid } from "@/lib/vendor-auction-demo";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, organizationId } = await getAuthedContext();
  const { id } = await params;
  if (!supabase) return NextResponse.json({ mode: "demo", rule: getDemoAutobid(id) });
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { data } = await supabase.from("vendor_autobid_rules").select("*").eq("vendor_id", id).eq("organization_id", organizationId).maybeSingle();
  return NextResponse.json({
    mode: "live",
    rule: {
      enabled: Boolean(data?.enabled),
      maxAmountCents: data?.max_amount_cents ?? null,
      minAmountCents: data?.min_amount_cents ?? null,
      undercutCents: data?.undercut_cents ?? 2500,
      minNoticeHours: data?.min_notice_hours ?? 4,
      jobDurationHours: data?.job_duration_hours ?? 2,
    },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, organizationId, role } = await getAuthedContext();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const rule = {
    enabled: body.enabled === true,
    maxAmountCents: body.maxAmount == null || body.maxAmount === "" ? null : Math.round(Number(body.maxAmount) * 100),
    minAmountCents: body.minAmount == null || body.minAmount === "" ? null : Math.round(Number(body.minAmount) * 100),
    undercutCents: body.undercut == null || body.undercut === "" ? 2500 : Math.round(Number(body.undercut) * 100),
    minNoticeHours: Number(body.minNoticeHours ?? 4),
    jobDurationHours: Number(body.jobDurationHours ?? 2),
  };
  if (!supabase) return NextResponse.json({ mode: "demo", rule: setDemoAutobid(id, rule) });
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!isNetworkAdmin(role)) return NextResponse.json({ error: "Network admin required" }, { status: 403 });
  const { data, error } = await supabase.from("vendor_autobid_rules").upsert({
    organization_id: organizationId,
    vendor_id: id,
    enabled: rule.enabled,
    max_amount_cents: rule.maxAmountCents,
    min_amount_cents: rule.minAmountCents,
    undercut_cents: rule.undercutCents,
    min_notice_hours: rule.minNoticeHours,
    job_duration_hours: rule.jobDurationHours,
    updated_at: new Date().toISOString(),
  }, { onConflict: "vendor_id" }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ mode: "live", rule: {
    enabled: data.enabled,
    maxAmountCents: data.max_amount_cents,
    minAmountCents: data.min_amount_cents,
    undercutCents: data.undercut_cents,
    minNoticeHours: data.min_notice_hours,
    jobDurationHours: data.job_duration_hours,
  } });
}
