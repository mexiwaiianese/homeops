// Full demo data set for one live (Supabase) organization.
//
// Every portal reads the same tables, so seeding them once makes the manager desk, owner portal,
// tenant portal, and vendor desk agree with each other: the tenant who owes rent is the one the
// manager sees on the collection board, the job the vendor sees on their desk is the scheduled
// request on the manager's board, and the owner's ledger is the same books the manager closes.
//
// The content mirrors the in-memory demo modules (lib/data, lib/vendor-demo, lib/books-demo,
// lib/listing-demo, lib/vendor-prospect-demo) so demo mode and live mode tell the same story.
//
// Idempotent by construction: every block looks up the record by a natural key before inserting
// and never updates rows that already exist. Re-running fills gaps and leaves tester edits alone.
// Anything the tester has created (new requests, payments, bids) is untouched.

import type { SupabaseClient } from "@supabase/supabase-js";
import { listDemoBills } from "@/lib/books-demo";
import { homes as demoHomes, initialMaintenance, owners as demoOwners, tenants as demoTenants } from "@/lib/data";
import { seedDemoOperatingHistory } from "@/lib/demo-ledger";
import { listingNetworks } from "@/lib/listing-networks";
import { DEFAULT_ORG_SETTINGS } from "@/lib/org-settings";
import { currentRentPeriod } from "@/lib/rent";
import { vendors as demoVendors } from "@/lib/vendor-demo";
import { demoProspects } from "@/lib/vendor-prospect-demo";
import { prospectFingerprint } from "@/lib/vendor-prospects";
import { buildVendorFingerprint, normalizeVendorName } from "@/lib/vendors";

export const DEMO_ORG_NAME = "HomeOps Demo Management";
export const DEMO_POSTAL_CODE = "84043";

export type SeedReport = {
  /** Rows inserted per table (only tables with at least one insert). */
  created: Record<string, number>;
  /** Optional blocks that could not be seeded (usually a missing migration). The core data still loaded. */
  warnings: string[];
};

type Admin = SupabaseClient;

function fail(table: string, error: { message: string } | null | undefined, fallback = "no row returned"): never {
  throw new Error(`${table}: ${error?.message || fallback}`);
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

// Demo vendor services are free text ("Water Heater"); the network stores service categories.
const SERVICE_CATEGORY_SLUG: Record<string, string> = {
  HVAC: "hvac",
  Furnace: "hvac",
  AC: "hvac",
  Plumbing: "plumbing",
  "Water Heater": "plumbing",
  "General Maintenance": "general-maintenance",
  "Appliance Repair": "appliance",
  Drywall: "general-maintenance",
};

// Vendor desk defaults that the in-memory auction store starts with (lib/vendor-auction-demo).
const CALENDARS: Record<string, "connected" | "disconnected"> = { v1: "connected", v2: "connected", v3: "disconnected" };
const AUTOBID: Record<string, { max: number; min: number; undercut: number; notice: number; duration: number }> = {
  v1: { max: 42000, min: 12000, undercut: 1500, notice: 2, duration: 2 },
  v2: { max: 90000, min: 18000, undercut: 2500, notice: 4, duration: 3 },
  v3: { max: 24000, min: 9000, undercut: 1000, notice: 4, duration: 2 },
};

function credentialType(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("license")) return "license";
  if (lower.includes("workers")) return "insurance_workers_comp";
  if (lower.includes("liability") || lower.includes("insurance")) return "insurance_general_liability";
  if (lower.includes("bond")) return "bond";
  return "certification";
}

// "Carrier 58STA • installed 2018" -> manufacturer Carrier, model 58STA, installed 2018-01-01
function parseSystem(detail: string) {
  const [head = "", tail = ""] = detail.split("•").map((part) => part.trim());
  const [manufacturer, ...model] = head.split(/\s+/);
  const year = (tail.match(/(19|20)\d{2}/) || head.match(/(19|20)\d{2}/))?.[0];
  return {
    manufacturer: manufacturer || null,
    model: model.join(" ") || null,
    installedOn: year ? `${year}-01-01` : null,
  };
}

function conditionFor(next: string): "good" | "watch" | "replace_soon" | null {
  const lower = next.toLowerCase();
  if (lower.includes("replacement")) return "replace_soon";
  if (lower.includes("due now")) return "watch";
  if (lower.includes("no action")) return "good";
  return null;
}

async function seedOptional(report: SeedReport, label: string, block: () => Promise<void>) {
  try {
    await block();
  } catch (error) {
    report.warnings.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function bump(report: SeedReport, table: string, count = 1) {
  if (!count) return;
  report.created[table] = (report.created[table] ?? 0) + count;
}

/**
 * Seed (or top up) one organization with the complete demo data set. Returns what was inserted.
 * Throws only when the core portfolio (owners, tenants, homes, leases, vendors) cannot be written.
 */
export async function seedDemoWorkspace(admin: Admin, organizationId: string): Promise<SeedReport> {
  const report: SeedReport = { created: {}, warnings: [] };

  // ----- Organization settings ---------------------------------------------------------------
  await seedOptional(report, "settings", async () => {
    const org = await admin.from("organizations").select("settings").eq("id", organizationId).maybeSingle();
    if (org.error) throw new Error(org.error.message);
    const current = (org.data?.settings ?? {}) as Record<string, unknown>;
    if (Object.keys(current).length) return;
    const { error } = await admin.from("organizations").update({ settings: DEFAULT_ORG_SETTINGS }).eq("id", organizationId);
    if (error) throw new Error(error.message);
  });

  // ----- Owners --------------------------------------------------------------------------------
  const ownerIds = new Map<string, string>();
  for (const owner of demoOwners) {
    const existing = await admin.from("owners").select("id").eq("organization_id", organizationId).eq("full_name", owner.name).maybeSingle();
    if (existing.data) { ownerIds.set(owner.id, existing.data.id); continue; }
    const inserted = await admin
      .from("owners")
      .insert({
        organization_id: organizationId,
        full_name: owner.name,
        email: owner.email,
        maintenance_authority_cents: owner.auth * 100,
        emergency_authority_cents: owner.emergency * 100,
        minimum_reserve_cents: owner.reserve * 100,
        notify_over_cents: owner.notifyOver * 100,
        preferred_vendor_name: owner.preferred,
        disbursement_day: owner.disbursement.startsWith("15") ? 15 : 10,
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) fail("owners", inserted.error);
    ownerIds.set(owner.id, inserted.data.id);
    bump(report, "owners");
  }

  // ----- Tenants -------------------------------------------------------------------------------
  const tenantIds = new Map<string, string>();
  for (const tenant of demoTenants) {
    const existing = await admin.from("tenants").select("id").eq("organization_id", organizationId).eq("full_name", tenant.name).maybeSingle();
    if (existing.data) { tenantIds.set(tenant.id, existing.data.id); continue; }
    const inserted = await admin
      .from("tenants")
      .insert({ organization_id: organizationId, full_name: tenant.name, email: tenant.email, phone: tenant.phone })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) fail("tenants", inserted.error);
    tenantIds.set(tenant.id, inserted.data.id);
    bump(report, "tenants");
  }

  // ----- Homes, leases, home passport assets ---------------------------------------------------
  const homeIds = new Map<string, string>();
  const leaseIds = new Map<string, string>();
  for (const home of demoHomes) {
    const ownerId = ownerIds.get(home.ownerId);
    const tenantId = tenantIds.get(home.tenantId);
    const tenant = demoTenants.find((row) => row.id === home.tenantId);
    if (!ownerId || !tenantId) continue;
    const [city, state] = home.city.split(",").map((part) => part.trim());
    const existing = await admin.from("homes").select("id").eq("organization_id", organizationId).eq("address1", home.address).maybeSingle();
    let homeId = existing.data?.id as string | undefined;
    if (!homeId) {
      const base = {
        organization_id: organizationId,
        owner_id: ownerId,
        address1: home.address,
        city: city || "Example City",
        state: state || "UT",
        postal_code: DEMO_POSTAL_CODE,
        monthly_rent_cents: home.rent * 100,
        reserve_balance_cents: home.reserve * 100,
        health_status: home.health,
        access_notes: home.access,
      };
      let inserted = await admin.from("homes").insert({ ...base, property_type: home.type }).select("id").single();
      // property_type arrived with the owner-portal migration; older schemas still get the home.
      if (inserted.error && /property_type/i.test(inserted.error.message)) inserted = await admin.from("homes").insert(base).select("id").single();
      if (inserted.error || !inserted.data) fail("homes", inserted.error);
      homeId = inserted.data.id as string;
      bump(report, "homes");
    }
    homeIds.set(home.id, homeId);

    const lease = await admin.from("leases").select("id").eq("home_id", homeId).eq("tenant_id", tenantId).maybeSingle();
    if (lease.data) leaseIds.set(home.tenantId, lease.data.id);
    else {
      const inserted = await admin
        .from("leases")
        .insert({
          organization_id: organizationId,
          home_id: homeId,
          tenant_id: tenantId,
          starts_on: "2026-03-01",
          ends_on: home.leaseEnds,
          rent_cents: home.rent * 100,
          deposit_cents: home.rent * 100,
          balance_cents: Math.round((tenant?.balance ?? 0) * 100),
          status: "active",
        })
        .select("id")
        .single();
      if (inserted.error || !inserted.data) fail("leases", inserted.error);
      leaseIds.set(home.tenantId, inserted.data.id);
      bump(report, "leases");
    }

    await seedOptional(report, "home_assets", async () => {
      const have = await admin.from("home_assets").select("category").eq("home_id", homeId);
      if (have.error) throw new Error(have.error.message);
      const present = new Set((have.data ?? []).map((row) => row.category as string));
      const rows = home.systems
        .filter((system) => !present.has(system.name))
        .map((system) => {
          const parsed = parseSystem(system.detail);
          return {
            organization_id: organizationId,
            home_id: homeId,
            category: system.name,
            manufacturer: parsed.manufacturer,
            model: parsed.model,
            installed_on: parsed.installedOn,
            condition: conditionFor(system.next),
            specifications: { detail: system.detail, age: system.age, next: system.next },
            notes: system.next,
          };
        });
      if (!rows.length) return;
      const { error } = await admin.from("home_assets").insert(rows);
      if (error) throw new Error(error.message);
      bump(report, "home_assets", rows.length);
    });
  }

  // ----- Vendors and the approved-network detail around them -----------------------------------
  const vendorIds = new Map<string, string>();
  for (const vendor of demoVendors) {
    const existing = await admin.from("vendors").select("id").eq("organization_id", organizationId).eq("name", vendor.name).maybeSingle();
    if (existing.data) { vendorIds.set(vendor.id, existing.data.id); continue; }
    const approved = ["approved", "preferred"].includes(vendor.approval_status);
    const inserted = await admin
      .from("vendors")
      .insert({
        organization_id: organizationId,
        name: vendor.name,
        trade: vendor.trade,
        email: vendor.email,
        phone: vendor.phone,
        city: vendor.city,
        state: vendor.state,
        postal_code: DEMO_POSTAL_CODE,
        normalized_name: normalizeVendorName(vendor.name),
        identity_fingerprint: buildVendorFingerprint({ name: vendor.name, phone: vendor.phone, email: vendor.email, postalCode: DEMO_POSTAL_CODE }),
        workflow_stage: vendor.workflow_stage,
        approval_status: vendor.approval_status,
        emergency_available: vendor.emergency_available,
        after_hours_available: vendor.emergency_available,
        expected_response_minutes: vendor.expected_response_minutes,
        minimum_trip_charge_cents: vendor.minimum_trip_charge_cents,
        hourly_rate_cents: vendor.hourly_rate_cents,
        w9_status: approved ? "verified" : "requested",
        tax_document_status: approved ? "verified" : "requested",
        application_submitted_at: hoursAgo(24 * 120),
        approved_at: approved ? hoursAgo(24 * 90) : null,
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) fail("vendors", inserted.error);
    vendorIds.set(vendor.id, inserted.data.id);
    bump(report, "vendors");
  }

  await seedOptional(report, "vendor_credentials", async () => {
    for (const vendor of demoVendors) {
      const vendorId = vendorIds.get(vendor.id);
      if (!vendorId) continue;
      const have = await admin.from("vendor_credentials").select("name").eq("vendor_id", vendorId);
      if (have.error) throw new Error(have.error.message);
      const present = new Set((have.data ?? []).map((row) => row.name as string));
      const rows = vendor.credentials
        .filter((credential) => !present.has(credential.name))
        .map((credential) => ({
          organization_id: organizationId,
          vendor_id: vendorId,
          credential_type: credentialType(credential.name),
          name: credential.name,
          issuing_authority: credentialType(credential.name) === "license" ? "Utah DOPL" : "Demo Mutual",
          identifier_last4: String(1000 + Math.abs(hashCode(`${vendor.id}:${credential.name}`)) % 9000),
          jurisdiction: "UT",
          issued_on: `${Number(credential.expires_on.slice(0, 4)) - 2}${credential.expires_on.slice(4)}`,
          expires_on: credential.expires_on,
          verification_status: credential.status === "verified" ? "verified" : credential.status === "pending" ? "pending" : "unverified",
          verified_at: credential.status === "verified" ? hoursAgo(24 * 60) : null,
        }));
      if (!rows.length) continue;
      const { error } = await admin.from("vendor_credentials").insert(rows);
      if (error) throw new Error(error.message);
      bump(report, "vendor_credentials", rows.length);
    }
  });

  await seedOptional(report, "vendor_services", async () => {
    const categories = await admin.from("service_categories").select("id, slug");
    if (categories.error) throw new Error(categories.error.message);
    const categoryId = new Map((categories.data ?? []).map((row) => [row.slug as string, row.id as string]));
    for (const vendor of demoVendors) {
      const vendorId = vendorIds.get(vendor.id);
      if (!vendorId) continue;
      const have = await admin.from("vendor_services").select("service_category_id").eq("vendor_id", vendorId);
      if (have.error) throw new Error(have.error.message);
      const present = new Set((have.data ?? []).map((row) => row.service_category_id as string));
      const rows: Array<Record<string, unknown>> = [];
      for (const service of vendor.services) {
        const id = categoryId.get(SERVICE_CATEGORY_SLUG[service] ?? "");
        if (!id || present.has(id)) continue;
        present.add(id);
        rows.push({ organization_id: organizationId, vendor_id: vendorId, service_category_id: id, specialty: service, active: true, emergency_supported: vendor.emergency_available });
      }
      if (!rows.length) continue;
      const { error } = await admin.from("vendor_services").insert(rows);
      if (error) throw new Error(error.message);
      bump(report, "vendor_services", rows.length);
    }
  });

  await seedOptional(report, "vendor_contacts", async () => {
    for (const vendor of demoVendors) {
      const vendorId = vendorIds.get(vendor.id);
      if (!vendorId) continue;
      const have = await admin.from("vendor_contacts").select("id").eq("vendor_id", vendorId).limit(1);
      if (have.error) throw new Error(have.error.message);
      if (have.data?.length) continue;
      const { error } = await admin.from("vendor_contacts").insert({
        organization_id: organizationId,
        vendor_id: vendorId,
        full_name: `${vendor.name} dispatch`,
        title: "Dispatcher",
        email: vendor.email,
        phone: vendor.phone,
        contact_type: "dispatcher",
        is_primary: true,
        emergency_contact: vendor.emergency_available,
      });
      if (error) throw new Error(error.message);
      bump(report, "vendor_contacts");
    }
  });

  await seedOptional(report, "vendor_owner_preferences", async () => {
    for (const owner of demoOwners) {
      const ownerId = ownerIds.get(owner.id);
      const vendor = demoVendors.find((row) => row.name === owner.preferred);
      const vendorId = vendor ? vendorIds.get(vendor.id) : null;
      if (!ownerId || !vendorId) continue;
      const have = await admin.from("vendor_owner_preferences").select("id").eq("owner_id", ownerId).eq("vendor_id", vendorId).limit(1);
      if (have.error) throw new Error(have.error.message);
      if (have.data?.length) continue;
      const { error } = await admin.from("vendor_owner_preferences").insert({
        organization_id: organizationId,
        owner_id: ownerId,
        vendor_id: vendorId,
        preference: "preferred",
        priority: 1,
        notes: "Owner's preferred vendor from onboarding.",
      });
      if (error) throw new Error(error.message);
      bump(report, "vendor_owner_preferences");
    }
  });

  await seedOptional(report, "vendor_calendar_connections", async () => {
    for (const vendor of demoVendors) {
      const vendorId = vendorIds.get(vendor.id);
      if (!vendorId) continue;
      const have = await admin.from("vendor_calendar_connections").select("id").eq("vendor_id", vendorId).maybeSingle();
      if (have.error) throw new Error(have.error.message);
      if (have.data) continue;
      const status = CALENDARS[vendor.id] ?? "disconnected";
      const { error } = await admin.from("vendor_calendar_connections").insert({
        organization_id: organizationId,
        vendor_id: vendorId,
        provider: "demo",
        status,
        connected_at: status === "connected" ? hoursAgo(24 * 7) : null,
        metadata: { busyBlocks: [] },
      });
      if (error) throw new Error(error.message);
      bump(report, "vendor_calendar_connections");
    }
  });

  await seedOptional(report, "vendor_autobid_rules", async () => {
    for (const vendor of demoVendors) {
      const vendorId = vendorIds.get(vendor.id);
      const rule = AUTOBID[vendor.id];
      if (!vendorId || !rule) continue;
      const have = await admin.from("vendor_autobid_rules").select("id").eq("vendor_id", vendorId).maybeSingle();
      if (have.error) throw new Error(have.error.message);
      if (have.data) continue;
      const { error } = await admin.from("vendor_autobid_rules").insert({
        organization_id: organizationId,
        vendor_id: vendorId,
        enabled: true,
        max_amount_cents: rule.max,
        min_amount_cents: rule.min,
        undercut_cents: rule.undercut,
        min_notice_hours: rule.notice,
        job_duration_hours: rule.duration,
      });
      if (error) throw new Error(error.message);
      bump(report, "vendor_autobid_rules");
    }
  });

  // A few closed jobs per vendor so scorecards show the same averages the demo cards quote.
  await seedOptional(report, "vendor_performance_events", async () => {
    for (const vendor of demoVendors) {
      const vendorId = vendorIds.get(vendor.id);
      if (!vendorId || !vendor.performance.jobs) continue;
      const have = await admin.from("vendor_performance_events").select("id").eq("vendor_id", vendorId).limit(1);
      if (have.error) throw new Error(have.error.message);
      if (have.data?.length) continue;
      const samples = Math.min(vendor.performance.jobs, 3);
      const rows = Array.from({ length: samples }, (_, index) => ({
        organization_id: organizationId,
        vendor_id: vendorId,
        response_minutes: vendor.performance.avgResponse + (index - 1) * 5,
        completion_minutes: 90 + index * 30,
        quoted_amount_cents: vendor.minimum_trip_charge_cents + vendor.hourly_rate_cents,
        invoiced_amount_cents: vendor.minimum_trip_charge_cents + vendor.hourly_rate_cents + (index === 1 ? 2500 : 0),
        callback_required: index === 0 && vendor.performance.callbackRate >= 0.1,
        manager_rating: vendor.performance.managerRating,
        tenant_rating: vendor.performance.managerRating ? Math.min(5, vendor.performance.managerRating + 0.2) : null,
        documentation_quality: vendor.performance.managerRating ? Math.max(1, vendor.performance.managerRating - 0.3) : null,
        notes: "Seeded history from the demo scorecard.",
        occurred_at: hoursAgo(24 * (14 + index * 21)),
      }));
      const { error } = await admin.from("vendor_performance_events").insert(rows);
      if (error) throw new Error(error.message);
      bump(report, "vendor_performance_events", rows.length);
    }
  });

  // ----- Maintenance board + the one job already awarded to a vendor ---------------------------
  const maintenanceIds = new Map<string, string>();
  await seedOptional(report, "maintenance_requests", async () => {
    for (const [index, row] of initialMaintenance.entries()) {
      const homeId = homeIds.get(row.homeId);
      if (!homeId) continue;
      const existing = await admin.from("maintenance_requests").select("id").eq("organization_id", organizationId).eq("home_id", homeId).eq("title", row.title).maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data) { maintenanceIds.set(row.id, existing.data.id); continue; }
      const tenant = demoTenants.find((item) => item.name === row.tenant);
      const openedAt = hoursAgo((index + 1) * 36);
      const inserted = await admin
        .from("maintenance_requests")
        .insert({
          organization_id: organizationId,
          home_id: homeId,
          tenant_id: tenant ? tenantIds.get(tenant.id) ?? null : null,
          vendor_id: row.vendorId ? vendorIds.get(row.vendorId) ?? null : null,
          title: row.title,
          description: row.note,
          priority: row.priority.toLowerCase(),
          status: row.status.toLowerCase(),
          diagnosis: { summary: row.note, source: "seed" },
          estimated_cost_cents: Math.round(row.estimate * 100),
          approved_cost_cents: row.status === "Scheduled" ? Math.round(row.estimate * 100) : null,
          owner_approval_required: row.status === "Authorize",
          opened_at: openedAt,
          updated_at: openedAt,
        })
        .select("id")
        .single();
      if (inserted.error || !inserted.data) throw new Error(inserted.error?.message || "no row returned");
      maintenanceIds.set(row.id, inserted.data.id);
      bump(report, "maintenance_requests");
    }
  });

  await seedOptional(report, "vendor_job_sites", async () => {
    const job = initialMaintenance.find((row) => row.vendorId);
    const requestId = job ? maintenanceIds.get(job.id) : null;
    const vendorId = job?.vendorId ? vendorIds.get(job.vendorId) : null;
    if (!job || !requestId || !vendorId) return;
    const have = await admin.from("vendor_job_sites").select("id").eq("maintenance_request_id", requestId).maybeSingle();
    if (have.error) throw new Error(have.error.message);
    if (have.data) return;
    const { error } = await admin.from("vendor_job_sites").insert({
      organization_id: organizationId,
      vendor_id: vendorId,
      maintenance_request_id: requestId,
      notified_at: minutesAgo(180),
      first_response_at: minutesAgo(165),
      awarded_at: minutesAgo(150),
      quoted_amount_cents: Math.round(job.estimate * 100),
    });
    if (error) throw new Error(error.message);
    bump(report, "vendor_job_sites");
  });

  // ----- Rent collection for the current month -------------------------------------------------
  await seedOptional(report, "rent_charges", async () => {
    const period = currentRentPeriod();
    for (const tenant of demoTenants) {
      const home = demoHomes.find((row) => row.tenantId === tenant.id);
      const homeId = home ? homeIds.get(home.id) : null;
      const tenantId = tenantIds.get(tenant.id);
      const leaseId = leaseIds.get(tenant.id);
      if (!home || !homeId || !tenantId || !leaseId) continue;
      const existing = await admin.from("rent_charges").select("id").eq("lease_id", leaseId).eq("period_start", period.periodStart).eq("kind", "rent").maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data) continue;
      const amountCents = Math.round(home.rent * 100);
      const paid = tenant.balance === 0;
      const inserted = await admin
        .from("rent_charges")
        .insert({
          organization_id: organizationId,
          home_id: homeId,
          lease_id: leaseId,
          tenant_id: tenantId,
          kind: "rent",
          period_start: period.periodStart,
          period_end: period.periodEnd,
          due_on: period.dueOn,
          amount_cents: amountCents,
          paid_cents: paid ? amountCents : 0,
          status: paid ? "paid" : "due",
          notes: paid ? "Autopay ACH cleared." : "Current month rent is outstanding.",
        })
        .select("id")
        .single();
      if (inserted.error || !inserted.data) throw new Error(inserted.error?.message || "no row returned");
      bump(report, "rent_charges");
      if (!paid) continue;
      const payment = await admin.from("rent_payments").insert({
        organization_id: organizationId,
        charge_id: inserted.data.id,
        amount_cents: amountCents,
        method: "stripe_ach",
        status: "succeeded",
        received_at: new Date(`${period.periodStart}T15:00:00`).toISOString(),
      });
      if (payment.error) throw new Error(payment.error.message);
      bump(report, "rent_payments");
    }
  });

  // ----- Vendor bills, then the operating ledger that references them --------------------------
  await seedOptional(report, "vendor_bills", async () => {
    const have = await admin.from("vendor_bills").select("vendor_name, amount_cents, due_on").eq("organization_id", organizationId);
    if (have.error) throw new Error(have.error.message);
    const present = new Set((have.data ?? []).map((row) => `${row.vendor_name}|${row.amount_cents}|${row.due_on}`));
    const rows = listDemoBills()
      .filter((bill) => !present.has(`${bill.vendorName}|${bill.amountCents}|${bill.dueOn}`))
      .map((bill) => ({
        organization_id: organizationId,
        home_id: bill.homeId ? homeIds.get(bill.homeId) ?? null : null,
        owner_id: bill.ownerId ? ownerIds.get(bill.ownerId) ?? null : null,
        vendor_id: bill.vendorId ? vendorIds.get(bill.vendorId) ?? null : null,
        vendor_name: bill.vendorName,
        kind: bill.kind,
        amount_cents: bill.amountCents,
        due_on: bill.dueOn,
        status: bill.status,
        paid_at: bill.paidAt ?? null,
        description: bill.description,
      }));
    if (!rows.length) return;
    const { error } = await admin.from("vendor_bills").insert(rows);
    if (error) throw new Error(error.message);
    bump(report, "vendor_bills", rows.length);
  });

  await seedOptional(report, "financial_transactions", async () => {
    bump(report, "financial_transactions", await seedDemoOperatingHistory(admin, organizationId));
  });

  // ----- Listings ------------------------------------------------------------------------------
  await seedOptional(report, "rental_listings", async () => {
    const home = demoHomes.find((row) => row.id === "h2");
    const homeId = home ? homeIds.get(home.id) : null;
    if (!home || !homeId) return;
    const have = await admin.from("rental_listings").select("id").eq("organization_id", organizationId).eq("home_id", homeId).maybeSingle();
    if (have.error) throw new Error(have.error.message);
    if (have.data) return;
    const { error } = await admin.from("rental_listings").insert({
      organization_id: organizationId,
      home_id: homeId,
      headline: "3 bed in Example City — available mid-October",
      description: "Single-family rental with updated HVAC and a fenced yard. Shown after current lease ends. Apply through HomeOps; this is not a public marketplace.",
      rent_cents: home.rent * 100,
      deposit_cents: home.rent * 100,
      available_on: home.leaseEnds,
      bedrooms: 3,
      bathrooms: 2.5,
      square_feet: 1680,
      property_type: "house",
      pet_policy: "Cats and dogs considered with deposit",
      lease_term: "12 months",
      status: "draft",
      photos: [],
    });
    if (error) throw new Error(error.message);
    bump(report, "rental_listings");
  });

  await seedOptional(report, "listing_network_connections", async () => {
    const have = await admin.from("listing_network_connections").select("network").eq("organization_id", organizationId);
    if (have.error) throw new Error(have.error.message);
    const present = new Set((have.data ?? []).map((row) => row.network as string));
    const rows = listingNetworks.filter((network) => !present.has(network.id)).map((network) => ({ organization_id: organizationId, network: network.id }));
    if (!rows.length) return;
    const { error } = await admin.from("listing_network_connections").insert(rows);
    if (error) throw new Error(error.message);
    bump(report, "listing_network_connections", rows.length);
  });

  // ----- Recruitment pipeline (the demo catalog the manager sees before running discovery) -----
  await seedOptional(report, "vendor_prospects", async () => {
    const have = await admin.from("vendor_prospects").select("source, source_place_id").eq("organization_id", organizationId);
    if (have.error) throw new Error(have.error.message);
    const present = new Set((have.data ?? []).map((row) => `${row.source}:${row.source_place_id}`));
    const byNormalizedName = new Map(demoVendors.map((vendor) => [normalizeVendorName(vendor.name), vendorIds.get(vendor.id) ?? null]));
    const now = new Date().toISOString();
    const rows = demoProspects
      .filter((prospect) => !present.has(`demo_catalog:${prospect.sourcePlaceId}`))
      .map((prospect) => ({
        organization_id: organizationId,
        source: "demo_catalog",
        source_place_id: prospect.sourcePlaceId,
        name: prospect.name,
        normalized_name: normalizeVendorName(prospect.name),
        identity_fingerprint: prospectFingerprint({ name: prospect.name, phone: prospect.phone, email: prospect.email, postalCode: prospect.postalCode }),
        category_slug: prospect.categorySlug,
        category_name: prospect.categoryName,
        phone: prospect.phone,
        email: prospect.email,
        website: prospect.website,
        address1: prospect.address1,
        city: prospect.city,
        state: prospect.state,
        postal_code: prospect.postalCode,
        public_rating: prospect.publicRating,
        review_count: prospect.reviewCount,
        public_rank_score: prospect.publicRankScore,
        editorial_summary: prospect.editorialSummary,
        maps_url: prospect.mapsUrl,
        vendor_id: byNormalizedName.get(normalizeVendorName(prospect.name)) ?? null,
        outreach_status: "discovered",
        last_discovered_at: now,
        updated_at: now,
      }));
    if (!rows.length) return;
    const { error } = await admin.from("vendor_prospects").insert(rows);
    if (error) throw new Error(error.message);
    bump(report, "vendor_prospects", rows.length);
  });

  return report;
}

/** "Created 3 owners, 4 homes, …" or a note that nothing was missing. */
export function summarizeSeed(report: SeedReport, organizationName = DEMO_ORG_NAME) {
  const parts = Object.entries(report.created).map(([table, count]) => `${count} ${table.replace(/_/g, " ")}`);
  const body = parts.length ? `Created ${parts.join(", ")} in "${organizationName}".` : `Demo data was already complete in "${organizationName}"; nothing changed.`;
  return report.warnings.length ? `${body} Skipped: ${report.warnings.join("; ")}.` : body;
}

function hashCode(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0;
  return hash;
}
