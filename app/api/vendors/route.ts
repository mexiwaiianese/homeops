import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { getOperatorAdmin } from "@/lib/operator-admin";
import { getPlatformCatalog, listAllVendorsForAdmin, listReleasedCatalogForOrg, stripCatalogDocuments, vendorOnRecruitmentBoard } from "@/lib/platform-catalog";
import { findCatalogDuplicates, queueCatalogIntake } from "@/lib/catalog-intake";
import { buildVendorFingerprint, canReleaseToOrganizations, isNetworkAdmin, normalizeVendorName } from "@/lib/vendors";
import { vendors as demoVendors } from "@/lib/vendor-demo";
import { demoProspects } from "@/lib/vendor-prospect-demo";

function filterDemo(rows: typeof demoVendors, q: string, status: string | null, stage: string | null) {
  let next = rows;
  if (q) next = next.filter((v) => [v.name, v.trade, v.city, v.state, ...v.services].join(" ").toLowerCase().includes(q));
  if (status) next = next.filter((v) => v.approval_status === status);
  if (stage) next = next.filter((v) => v.workflow_stage === stage);
  return next;
}

function screenedNotOnBoardRows(
  rows: Array<Record<string, unknown>>,
  prospects: Array<{ vendor_id?: string | null; normalized_name?: string | null; identity_fingerprint?: string | null; name?: string | null }>,
) {
  return rows
    .filter((row) => {
      const screened = canReleaseToOrganizations(String(row.workflow_stage ?? "")) || Boolean(row.catalog_released);
      if (!screened) return false;
      return !vendorOnRecruitmentBoard({
        id: String(row.id ?? ""),
        identity_fingerprint: (row.identity_fingerprint as string | null) ?? null,
        normalized_name: (row.normalized_name as string | null) ?? null,
        name: String(row.name ?? ""),
      }, prospects);
    })
    .map((row) => ({
      id: String(row.id ?? ""),
      name: String(row.name ?? ""),
      trade: (row.trade as string | null) ?? null,
      city: (row.city as string | null) ?? null,
      state: (row.state as string | null) ?? null,
      workflow_stage: row.workflow_stage,
      approval_status: row.approval_status,
      organization_name: (row.organization_name as string | null) ?? null,
      in_platform_catalog: Boolean(row.in_platform_catalog),
    }));
}

export async function GET(request: Request) {
  const { supabase, user, organizationId, role } = await getAuthedContext();
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const status = searchParams.get("status");
  const stage = searchParams.get("stage");
  const platformAdmin = (await getOperatorAdmin()).allowed;
  const emptyMeta = { categories: [], owners: [], homes: [] };

  if (!supabase) {
    if (platformAdmin) {
      const vendors = filterDemo(demoVendors, q, status, stage);
      return NextResponse.json({
        mode: "demo",
        role: null,
        platformAdmin: true,
        vendors,
        catalog: [],
        screenedNotOnBoard: screenedNotOnBoardRows(vendors as unknown as Array<Record<string, unknown>>, demoProspects),
        meta: emptyMeta,
      });
    }
    const released = demoVendors.filter((v) => v.catalog_released);
    return NextResponse.json({
      mode: "demo",
      vendors: filterDemo(demoVendors.filter((v) => ["preferred", "approved"].includes(v.approval_status)), q, status, stage),
      catalog: filterDemo(released, q, status, stage),
      role: "manager",
      platformAdmin: false,
    });
  }

  if (platformAdmin) {
    const catalog = await getPlatformCatalog();
    if (!catalog.ok) {
      return NextResponse.json({
        mode: "live",
        role: null,
        platformAdmin: true,
        vendors: [],
        catalog: [],
        meta: emptyMeta,
        warning: catalog.error,
      });
    }
    const listed = await listAllVendorsForAdmin(catalog.admin, catalog.organizationId, { q, status, stage });
    if (listed.error && !listed.data.length) return NextResponse.json({ error: listed.error.message }, { status: 500 });
    const rows = listed.data;
    const { data: categories } = await catalog.admin.from("service_categories").select("id,name").eq("active", true).order("name");
    const { data: prospects } = await catalog.admin
      .from("vendor_prospects")
      .select("vendor_id,normalized_name,identity_fingerprint,name");
    const screenedNotOnBoard = screenedNotOnBoardRows(rows as Array<Record<string, unknown>>, prospects ?? []);
    return NextResponse.json({
      mode: "live",
      role: "platform",
      platformAdmin: true,
      vendors: rows,
      catalog: [],
      screenedNotOnBoard,
      meta: { categories: categories ?? [], owners: [], homes: [] },
      warning: listed.warning,
    });
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

  const [{ data: categories }, { data: owners }, { data: homes }] = await Promise.all([
    supabase.from("service_categories").select("id,name").eq("active", true).order("name"),
    supabase.from("owners").select("id,full_name").eq("organization_id", organizationId).order("full_name"),
    supabase.from("homes").select("id,address1").eq("organization_id", organizationId).order("address1"),
  ]);

  let catalogRows: unknown[] = [];
  if (isNetworkAdmin(role)) {
    const catalog = await getPlatformCatalog();
    if (catalog.ok) {
      const released = await listReleasedCatalogForOrg(catalog.admin, catalog.organizationId);
      const adoptedIds = new Set((data ?? []).map((row: { catalog_vendor_id?: string | null }) => row.catalog_vendor_id).filter(Boolean));
      catalogRows = (released.data ?? [])
        .filter((row: { id: string }) => !adoptedIds.has(row.id))
        .map((row) => stripCatalogDocuments(row as Record<string, unknown>));
    }
  }

  return NextResponse.json({
    mode: "live",
    role,
    platformAdmin: false,
    vendors: data ?? [],
    catalog: catalogRows,
    meta: { categories: categories ?? [], owners: owners ?? [], homes: homes ?? [] },
  });
}

export async function POST(request: Request) {
  const platformAdmin = (await getOperatorAdmin()).allowed;
  const { supabase, user, organizationId, role } = await getAuthedContext();
  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Vendor name is required" }, { status: 400 });

  const fingerprint = buildVendorFingerprint({ name, phone: body.phone, email: body.email, postalCode: body.postalCode });
  const normalized = normalizeVendorName(name);
  const row = {
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
    catalog_released: false,
  };

  if (platformAdmin) {
    const catalog = await getPlatformCatalog();
    if (!catalog.ok) return NextResponse.json({ error: catalog.error }, { status: 400 });
    const { data: duplicates } = await catalog.admin
      .from("vendors")
      .select("id,name,phone,email,city,state,approval_status")
      .eq("organization_id", catalog.organizationId)
      .or(`identity_fingerprint.eq.${fingerprint},normalized_name.eq.${normalized}`)
      .limit(5);
    if ((duplicates ?? []).length && !body.confirmDuplicate) {
      return NextResponse.json({ error: "Possible duplicate vendor", duplicates }, { status: 409 });
    }
    const { data, error } = await catalog.admin.from("vendors").insert({
      ...row,
      organization_id: catalog.organizationId,
    }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ vendor: data }, { status: 201 });
  }

  if (!supabase || !user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!isNetworkAdmin(role)) return NextResponse.json({ error: "Network admin required" }, { status: 403 });

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
    ...row,
    organization_id: organizationId,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const matches = await findCatalogDuplicates({
    name,
    phone: body.phone,
    email: body.email,
    postalCode: body.postalCode,
  });
  const { data: org } = await supabase.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  const catalogReview = await queueCatalogIntake({
    organizationId,
    organizationName: org?.name,
    vendor: {
      id: data.id,
      name: data.name,
      trade: data.trade,
      email: data.email,
      phone: data.phone,
      city: data.city,
      state: data.state,
      identity_fingerprint: fingerprint,
    },
    matches,
    userId: user.id,
  });

  return NextResponse.json({
    vendor: data,
    catalogReview: {
      id: catalogReview.id,
      matchCount: matches.length,
    },
  }, { status: 201 });
}
