import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { buildVendorFingerprint, isNetworkAdmin, normalizeVendorName } from "@/lib/vendors";
import { vendors as demoVendors } from "@/lib/vendor-demo";

export async function GET(request: Request) {
  const { supabase, user, organizationId, role } = await getAuthedContext();
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const status = searchParams.get("status");
  const stage = searchParams.get("stage");

  if (!supabase) {
    let rows = demoVendors;
    if (q) rows = rows.filter(v => [v.name, v.trade, v.city, v.state, ...v.services].join(" ").toLowerCase().includes(q));
    if (status) rows = rows.filter(v => v.approval_status === status);
    if (stage) rows = rows.filter(v => v.workflow_stage === stage);
    return NextResponse.json({ mode: "demo", vendors: rows, role: "manager" });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  let query = supabase
    .from("vendors")
    .select("*, vendor_contacts(*), vendor_services(*, service_categories(*)), vendor_service_areas(*), vendor_credentials(*), vendor_documents(*), vendor_pricing_items(*), vendor_owner_preferences(*), vendor_property_preferences(*), vendor_performance_events(*)")
    .eq("organization_id", organizationId)
    .order("name");

  if (status) query = query.eq("approval_status", status);
  if (stage) query = query.eq("workflow_stage", stage);
  if (q) query = query.or(`name.ilike.%${q}%,trade.ilike.%${q}%,city.ilike.%${q}%,state.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  for (const vendor of data ?? []) {
    await supabase.rpc("refresh_vendor_eligibility", { v_id: vendor.id });
  }

  const [{data:categories},{data:owners},{data:homes}]=await Promise.all([
    supabase.from("service_categories").select("id,name").eq("active",true).order("name"),
    supabase.from("owners").select("id,full_name").eq("organization_id",organizationId).order("full_name"),
    supabase.from("homes").select("id,address1").eq("organization_id",organizationId).order("address1")]);
  return NextResponse.json({ mode: "live", role, vendors: data ?? [], meta:{categories:categories??[],owners:owners??[],homes:homes??[]} });
}

export async function POST(request: Request) {
  const { supabase, user, organizationId, role } = await getAuthedContext();
  if (!supabase || !user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!isNetworkAdmin(role)) return NextResponse.json({ error: "Network admin required" }, { status: 403 });
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Vendor name is required" }, { status: 400 });

  const fingerprint = buildVendorFingerprint({ name, phone: body.phone, email: body.email, postalCode: body.postalCode });
  const normalized = normalizeVendorName(name);
  const { data: duplicates } = await supabase
    .from("vendors")
    .select("id,name,phone,email,city,state,approval_status")
    .eq("organization_id", organizationId)
    .or(`identity_fingerprint.eq.${fingerprint},normalized_name.eq.${normalized}`)
    .limit(5);

  if ((duplicates ?? []).length && !body.confirmDuplicate) {
    return NextResponse.json({ error: "Possible duplicate vendor", duplicates }, { status: 409 });
  }

  const { data, error } = await supabase.from("vendors").insert({
    organization_id: organizationId,
    name,
    legal_name: body.legalName || null,
    dba_name: body.dbaName || null,
    normalized_name: normalized,
    identity_fingerprint: fingerprint,
    trade: body.trade || null,
    email: body.email || null,
    phone: body.phone || null,
    website: body.website || null,
    address1: body.address1 || null,
    city: body.city || null,
    state: body.state || null,
    postal_code: body.postalCode || null,
    workflow_stage: "candidate",
    approval_status: "conditional",
    private_notes: body.privateNotes || null,
    emergency_available: Boolean(body.emergencyAvailable),
    after_hours_available: Boolean(body.afterHoursAvailable),
    expected_response_minutes: body.expectedResponseMinutes ? Number(body.expectedResponseMinutes) : null,
    minimum_trip_charge_cents: body.minimumTripCharge ? Math.round(Number(body.minimumTripCharge) * 100) : null,
    hourly_rate_cents: body.hourlyRate ? Math.round(Number(body.hourlyRate) * 100) : null,
    diagnostic_fee_cents: body.diagnosticFee ? Math.round(Number(body.diagnosticFee) * 100) : null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ vendor: data }, { status: 201 });
}
