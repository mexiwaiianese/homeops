import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";

const STATUSES = ["diagnose", "authorize", "dispatch", "scheduled", "repair", "invoice", "documented"] as const;
type MaintenanceStatus = (typeof STATUSES)[number];

function asStatus(value: unknown): MaintenanceStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase() as MaintenanceStatus;
  return STATUSES.includes(normalized) ? normalized : null;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function optionalRating(value: unknown) {
  const n = optionalNumber(value);
  if (n === null) return null;
  if (n === undefined || n < 1 || n > 5) return undefined;
  return n;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase || !user || !organizationId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const status = asStatus(body.status);
  if (!status) return NextResponse.json({ error: "Invalid maintenance status" }, { status: 400 });

  const { data: current, error: readError } = await supabase
    .from("maintenance_requests")
    .select("id, home_id, vendor_id, estimated_cost_cents, status")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();
  if (readError || !current) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "documented") updates.completed_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("maintenance_requests")
    .update(updates)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select("*, vendors(name)")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (status !== "documented" || !current.vendor_id) {
    return NextResponse.json({ maintenance: data, performanceCaptured: false });
  }

  const responseMinutes = optionalNumber(body.performance?.responseMinutes);
  const completionMinutes = optionalNumber(body.performance?.completionMinutes);
  const quotedAmount = optionalNumber(body.performance?.quotedAmount);
  const invoicedAmount = optionalNumber(body.performance?.invoicedAmount);
  const tenantRating = optionalRating(body.performance?.tenantRating);
  const managerRating = optionalRating(body.performance?.managerRating);
  const documentationQuality = optionalRating(body.performance?.documentationQuality);
  if (
    [responseMinutes, completionMinutes, quotedAmount, invoicedAmount, tenantRating, managerRating, documentationQuality]
      .includes(undefined)
  ) {
    return NextResponse.json({ error: "Invalid performance values" }, { status: 400 });
  }

  const event = {
    organization_id: organizationId,
    vendor_id: current.vendor_id,
    maintenance_request_id: id,
    home_id: current.home_id,
    response_minutes: responseMinutes,
    completion_minutes: completionMinutes,
    quoted_amount_cents:
      quotedAmount != null ? Math.round(quotedAmount * 100) : current.estimated_cost_cents,
    invoiced_amount_cents: invoicedAmount != null ? Math.round(invoicedAmount * 100) : null,
    callback_required: Boolean(body.performance?.callbackRequired),
    tenant_rating: tenantRating,
    manager_rating: managerRating,
    documentation_quality: documentationQuality,
    notes: typeof body.performance?.notes === "string" && body.performance.notes.trim()
      ? body.performance.notes.trim()
      : null,
    occurred_at: new Date().toISOString(),
  };

  const { data: existing } = await supabase
    .from("vendor_performance_events")
    .select("id")
    .eq("maintenance_request_id", id)
    .maybeSingle();

  const write = existing
    ? await supabase.from("vendor_performance_events").update(event).eq("id", existing.id).select().single()
    : await supabase.from("vendor_performance_events").insert(event).select().single();

  if (write.error) return NextResponse.json({ error: write.error.message }, { status: 400 });
  return NextResponse.json({ maintenance: data, performanceCaptured: true, performance: write.data });
}
