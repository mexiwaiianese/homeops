import type { SupabaseClient } from "@supabase/supabase-js";
import { listDemoBills, listDemoEntries } from "@/lib/books-demo";
import type { BookEntry } from "@/lib/books";
import { homes as demoHomes, owners as demoOwners, tenants as demoTenants } from "@/lib/data";

/** The shared demo organization used before per-tester sandboxes existed. Never auto-pruned. */
export const DEMO_ORG_SLUG = "homeops-demo-management";
/** Per-tester sandboxes: `homeops-demo-ws-<random>`. Created on unlock, deleted on the next unlock. */
export const DEMO_WORKSPACE_SLUG_PREFIX = "homeops-demo-ws-";

/** True for any organization whose data is disposable demo content (shared org or a tester sandbox). */
export function isDemoOrganizationSlug(slug: string | null | undefined) {
  return slug === DEMO_ORG_SLUG || Boolean(slug && slug.startsWith(DEMO_WORKSPACE_SLUG_PREFIX));
}

// Stable key so re-seeding the demo organization fills gaps without duplicating history.
function demoExternalId(entry: BookEntry) {
  return `demo:${entry.kind}:${entry.txDate}:${entry.homeId || ""}:${entry.ownerId || ""}:${entry.amountCents}:${entry.description}`;
}

function rowFor(
  organizationId: string,
  entry: BookEntry,
  propertyId: string | null,
  ownerId: string | null,
  tenantId: string | null,
  links: { chargeId: string | null; billId: string | null },
) {
  return {
    organization_id: organizationId,
    external_id: demoExternalId(entry),
    tx_date: entry.txDate,
    vendor_name: entry.vendorName,
    description: entry.description,
    account_name: entry.accountName,
    amount_cents: entry.amountCents,
    flow_type: entry.flowType,
    property_id: propertyId,
    allocation_status: entry.allocationStatus,
    normalized_category: entry.accountName,
    match_confidence: 1,
    match_reason: "Demo operating history",
    raw_data: {},
    source: entry.source,
    kind: entry.kind,
    owner_id: ownerId,
    tenant_id: tenantId,
    charge_id: links.chargeId,
    bill_id: links.billId,
  };
}

// The demo books reference in-memory ids ("chg-t1-2026-09-01", "bill-hvac-h1"). On a live
// organization those records are real rows, so look them up and link the ledger to them. That
// way the books sync (which posts "rent collected" per paid charge) updates the seeded row
// instead of adding a duplicate, and paid bills resolve to their ledger entry.
async function demoLinkMaps(db: SupabaseClient, organizationId: string, tenantIds: Map<string, string>) {
  const [chargeRows, billRows] = await Promise.all([
    db.from("rent_charges").select("id, tenant_id, period_start, kind").eq("organization_id", organizationId),
    db.from("vendor_bills").select("id, vendor_name, amount_cents, due_on").eq("organization_id", organizationId),
  ]);
  const chargeIds = new Map<string, string>();
  if (!chargeRows.error) {
    const demoTenantByLive = new Map([...tenantIds.entries()].map(([demoId, liveId]) => [liveId, demoId]));
    for (const row of chargeRows.data ?? []) {
      const demoTenant = demoTenantByLive.get(row.tenant_id as string);
      if (demoTenant && row.kind === "rent") chargeIds.set(`chg-${demoTenant}-${row.period_start}`, row.id as string);
    }
  }
  const billIds = new Map<string, string>();
  if (!billRows.error) {
    for (const bill of listDemoBills()) {
      const match = (billRows.data ?? []).find((row) => row.vendor_name === bill.vendorName && row.amount_cents === bill.amountCents && row.due_on === bill.dueOn);
      if (match) billIds.set(bill.id, match.id as string);
    }
  }
  return { chargeIds, billIds };
}

// Copies the in-memory demo books onto the live demo organization, remapped to its
// real home and owner ids. Idempotent. Returns how many rows were inserted.
export async function seedDemoOperatingHistory(db: SupabaseClient, organizationId: string): Promise<number> {
  const [homeRows, ownerRows, tenantRows, existingRows] = await Promise.all([
    db.from("homes").select("id, address1").eq("organization_id", organizationId),
    db.from("owners").select("id, full_name").eq("organization_id", organizationId),
    db.from("tenants").select("id, full_name").eq("organization_id", organizationId),
    db.from("financial_transactions").select("external_id").eq("organization_id", organizationId).like("external_id", "demo:%"),
  ]);
  if (homeRows.error) throw new Error(homeRows.error.message);
  if (ownerRows.error) throw new Error(ownerRows.error.message);
  if (tenantRows.error) throw new Error(tenantRows.error.message);
  if (existingRows.error) throw new Error(existingRows.error.message);

  const homeByAddress = new Map((homeRows.data ?? []).map((row) => [row.address1, row.id as string]));
  const ownerByName = new Map((ownerRows.data ?? []).map((row) => [row.full_name, row.id as string]));
  const tenantByName = new Map((tenantRows.data ?? []).map((row) => [row.full_name, row.id as string]));
  const homeIds = new Map(demoHomes.filter((home) => homeByAddress.has(home.address)).map((home) => [home.id, homeByAddress.get(home.address)!]));
  const ownerIds = new Map(demoOwners.filter((owner) => ownerByName.has(owner.name)).map((owner) => [owner.id, ownerByName.get(owner.name)!]));
  const tenantIds = new Map(demoTenants.filter((tenant) => tenantByName.has(tenant.name)).map((tenant) => [tenant.id, tenantByName.get(tenant.name)!]));
  const existing = new Set((existingRows.data ?? []).map((row) => row.external_id as string));
  const links = await demoLinkMaps(db, organizationId, tenantIds);

  const rows = [];
  for (const entry of listDemoEntries()) {
    const key = demoExternalId(entry);
    if (existing.has(key)) continue;
    const propertyId = entry.homeId ? homeIds.get(entry.homeId) ?? null : null;
    if (entry.homeId && !propertyId) continue;
    const ownerId = entry.ownerId ? ownerIds.get(entry.ownerId) ?? null : null;
    if (entry.ownerId && !ownerId) continue;
    if (!propertyId && !ownerId) continue;
    const tenantId = entry.tenantId ? tenantIds.get(entry.tenantId) ?? null : null;
    rows.push(rowFor(organizationId, entry, propertyId, ownerId, tenantId, {
      chargeId: entry.chargeId ? links.chargeIds.get(entry.chargeId) ?? null : null,
      billId: entry.billId ? links.billIds.get(entry.billId) ?? null : null,
    }));
  }
  if (!rows.length) return 0;

  const transfers = rows.filter((row) => row.flow_type === "transfer");
  const operating = rows.filter((row) => row.flow_type !== "transfer");
  let inserted = 0;
  for (const batch of [operating, transfers]) {
    if (!batch.length) continue;
    const { error } = await db.from("financial_transactions").insert(batch);
    if (error) {
      // Owner draws use flow_type "transfer", which older ledgers reject. Keep income and expenses.
      if (batch === transfers) continue;
      throw new Error(error.message);
    }
    inserted += batch.length;
  }
  return inserted;
}
