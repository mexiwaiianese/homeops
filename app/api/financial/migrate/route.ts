import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { buildMigrationPlan, emptyMapping, type MigrationMapping, type PlannedRow } from "@/lib/csv-migration";
import { normalize } from "@/lib/financial";
import { recordHomeOverage } from "@/lib/property-overage-billing";

function rowKey(row: PlannedRow) {
  return createHash("sha256")
    .update([row.date, normalize(row.vendor), row.amountCents, row.flow, normalize(row.address), row.description, row.index].join("|"))
    .digest("hex")
    .slice(0, 32);
}

function plusYear(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${year + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export async function POST(request: Request) {
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase) return NextResponse.json({ error: "Sign in to a workspace to save this file." }, { status: 400 });
  if (!user || !organizationId) return NextResponse.json({ error: "Sign in to a workspace to save this file." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const headers = Array.isArray(body.headers) ? body.headers.map(String) : [];
  const mapping = { ...emptyMapping(), ...(body.mapping || {}) } as MigrationMapping;
  const notes = Array.isArray(body.notes) ? body.notes.map(String) : undefined;
  if (!rows.length) return NextResponse.json({ error: "Upload a CSV before saving." }, { status: 400 });
  const plan = buildMigrationPlan(rows, mapping, headers, notes);
  if (!plan.homes && !plan.transactions) {
    return NextResponse.json({ error: "Map a property address or a transaction date and amount before saving." }, { status: 400 });
  }

  const { data: owners, error: ownerError } = await supabase.from("owners").select("id").eq("organization_id", organizationId).limit(1);
  if (ownerError) return NextResponse.json({ error: ownerError.message }, { status: 500 });
  let ownerId = owners?.[0]?.id as string | undefined;
  if (!ownerId) {
    const created = await supabase.from("owners").insert({ organization_id: organizationId, full_name: "Imported portfolio" }).select("id").single();
    if (created.error || !created.data) return NextResponse.json({ error: created.error?.message || "Could not open an owner for these homes." }, { status: 500 });
    ownerId = created.data.id;
  }

  const { data: homeRows, error: homeError } = await supabase.from("homes").select("id,address1,city").eq("organization_id", organizationId);
  if (homeError) return NextResponse.json({ error: homeError.message }, { status: 500 });
  const homes = new Map<string, string>();
  for (const home of homeRows ?? []) homes.set(normalize(home.address1), home.id);

  let homesCreated = 0;
  for (const row of plan.rows) {
    const key = normalize(row.address);
    if (key.length < 5 || homes.has(key)) continue;
    const inserted = await supabase.from("homes").insert({
      organization_id: organizationId,
      owner_id: ownerId,
      address1: row.address,
      city: row.city || "Unknown",
      state: row.state || "NA",
      postal_code: row.postal || null,
      monthly_rent_cents: row.rentCents || null,
      property_notes: row.notes || null,
    }).select("id").single();
    if (inserted.error || !inserted.data) return NextResponse.json({ error: inserted.error?.message || "Could not save a home." }, { status: 500 });
    homes.set(key, inserted.data.id);
    homesCreated += 1;
    await recordHomeOverage({ organizationId, homeId: inserted.data.id, supabase }).catch(() => null);
  }

  const { data: tenantRows, error: tenantError } = await supabase.from("tenants").select("id,full_name,email").eq("organization_id", organizationId);
  if (tenantError) return NextResponse.json({ error: tenantError.message }, { status: 500 });
  const tenants = new Map<string, string>();
  for (const tenant of tenantRows ?? []) {
    if (tenant.email) tenants.set(String(tenant.email).toLowerCase(), tenant.id);
    tenants.set(normalize(tenant.full_name), tenant.id);
  }
  let tenantsCreated = 0;
  for (const row of plan.rows) {
    if (!row.tenant) continue;
    const emailKey = row.tenantEmail.toLowerCase();
    const nameKey = normalize(row.tenant);
    if ((emailKey && tenants.has(emailKey)) || tenants.has(nameKey)) {
      const id = (emailKey && tenants.get(emailKey)) || tenants.get(nameKey)!;
      if (emailKey) tenants.set(emailKey, id);
      tenants.set(nameKey, id);
      continue;
    }
    const withNotes = await supabase.from("tenants").insert({
      organization_id: organizationId,
      full_name: row.tenant,
      email: row.tenantEmail || null,
      phone: row.tenantPhone || null,
      notes: row.notes || null,
    }).select("id").single();
    const inserted = withNotes.error && /notes/i.test(withNotes.error.message)
      ? await supabase.from("tenants").insert({
        organization_id: organizationId,
        full_name: row.tenant,
        email: row.tenantEmail || null,
        phone: row.tenantPhone || null,
      }).select("id").single()
      : withNotes;
    if (inserted.error || !inserted.data) return NextResponse.json({ error: inserted.error?.message || "Could not save a tenant." }, { status: 500 });
    if (emailKey) tenants.set(emailKey, inserted.data.id);
    tenants.set(nameKey, inserted.data.id);
    tenantsCreated += 1;
    const homeId = homes.get(normalize(row.address));
    if (!homeId) continue;
    const start = row.date || new Date().toISOString().slice(0, 10);
    await supabase.from("leases").insert({
      organization_id: organizationId,
      home_id: homeId,
      tenant_id: inserted.data.id,
      starts_on: start,
      ends_on: plusYear(start),
      rent_cents: row.rentCents,
      status: "active",
    });
  }

  const { data: vendorRows, error: vendorError } = await supabase.from("vendors").select("id,name").eq("organization_id", organizationId);
  if (vendorError) return NextResponse.json({ error: vendorError.message }, { status: 500 });
  const vendors = new Map<string, string>();
  for (const vendor of vendorRows ?? []) vendors.set(normalize(vendor.name), vendor.id);
  let vendorsCreated = 0;
  for (const row of plan.rows) {
    if (row.flow !== "expense" || !row.vendor || normalize(row.vendor) === normalize(row.tenant)) continue;
    const key = normalize(row.vendor);
    if (vendors.has(key)) continue;
    const withNotes = await supabase.from("vendors").insert({
      organization_id: organizationId,
      name: row.vendor,
      trade: row.trade || null,
      private_notes: row.notes || null,
    }).select("id").single();
    const inserted = withNotes.error && /private_notes/i.test(withNotes.error.message)
      ? await supabase.from("vendors").insert({
        organization_id: organizationId,
        name: row.vendor,
        trade: row.trade || null,
      }).select("id").single()
      : withNotes;
    if (inserted.error || !inserted.data) return NextResponse.json({ error: inserted.error?.message || "Could not save a vendor." }, { status: 500 });
    vendors.set(key, inserted.data.id);
    vendorsCreated += 1;
  }

  const txRows = plan.rows.filter((row) => row.date && row.flow && row.amountCents > 0);
  const keys = txRows.map(rowKey);
  const existing = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await supabase.from("financial_transactions").select("external_id").eq("organization_id", organizationId).in("external_id", keys.slice(i, i + 200));
    for (const found of data ?? []) if (found.external_id) existing.add(found.external_id);
  }
  const fresh = txRows.filter((row) => !existing.has(rowKey(row)));
  const { data: batch, error: batchError } = await supabase.from("financial_import_batches").insert({
    organization_id: organizationId,
    source: "csv",
    file_name: String(body.fileName || "import.csv"),
    status: "processing",
    source_config: { mapping, unmapped: plan.unmapped },
    total_rows: rows.length,
    imported_by: user.id,
  }).select("id").single();
  if (batchError || !batch) return NextResponse.json({ error: batchError?.message || "Could not open the import." }, { status: 500 });

  let stored = 0;
  for (let i = 0; i < fresh.length; i += 400) {
    const chunk = fresh.slice(i, i + 400).map((row) => {
      const homeId = homes.get(normalize(row.address)) || null;
      const tenantId = (row.tenantEmail && tenants.get(row.tenantEmail.toLowerCase())) || tenants.get(normalize(row.tenant)) || null;
      const vendorId = vendors.get(normalize(row.vendor)) || null;
      return {
        organization_id: organizationId,
        import_batch_id: batch.id,
        external_id: rowKey(row),
        tx_date: row.date,
        vendor_name: row.vendor || null,
        description: row.description || null,
        memo: row.notes || null,
        account_name: row.account || null,
        amount_cents: row.amountCents,
        flow_type: row.flow,
        property_id: homeId,
        owner_id: ownerId,
        tenant_id: tenantId,
        vendor_id: vendorId,
        allocation_status: homeId ? "matched" : "review",
        match_confidence: homeId ? 1 : 0,
        match_reason: homeId ? "Matched the property address on the CSV row." : "No property address on this row.",
        source: "csv",
        kind: row.kind,
        raw_data: rows[row.index] || {},
      };
    });
    let inserted = await supabase.from("financial_transactions").insert(chunk);
    if (inserted.error && /source/i.test(inserted.error.message)) {
      inserted = await supabase.from("financial_transactions").insert(chunk.map((entry) => ({ ...entry, source: "quickbooks_csv" })));
    }
    if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 500 });
    stored += chunk.length;
  }
  await supabase.from("financial_import_batches").update({
    status: "complete",
    matched_rows: fresh.filter((row) => homes.has(normalize(row.address))).length,
    review_rows: fresh.filter((row) => !homes.has(normalize(row.address))).length,
    completed_at: new Date().toISOString(),
  }).eq("id", batch.id);

  return NextResponse.json({
    ok: true,
    homes: homesCreated,
    tenants: tenantsCreated,
    vendors: vendorsCreated,
    transactions: stored,
    skipped: txRows.length - fresh.length,
    insights: plan.insights,
  });
}
