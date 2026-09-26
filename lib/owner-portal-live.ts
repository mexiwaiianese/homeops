import type { SupabaseClient } from "@supabase/supabase-js";
import { listLiveEntries } from "@/lib/books-live";
import { isDemoOrganizationSlug, seedDemoOperatingHistory } from "@/lib/demo-ledger";
import { depositsHeldByHome } from "@/lib/owner-portal-demo";
import {
  isPropertyType,
  parseLayout,
  type CustomMetric,
  type DashboardLayout,
  type MetricDefinition,
  type OwnerHome,
  type OwnerMaintenance,
  type OwnerPortalPayload,
} from "@/lib/owner-portal";

function mapMetric(row: any): CustomMetric {
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    expression: row.expression,
    format: row.format,
    explanation: row.explanation || "",
    scope: row.scope || null,
    period: row.period || null,
    createdAt: row.created_at,
  };
}

const statusLabel: Record<string, string> = {
  diagnose: "Diagnose",
  authorize: "Authorize",
  dispatch: "Dispatch",
  scheduled: "Scheduled",
  repair: "Repair",
  invoice: "Invoice",
  documented: "Documented",
};

export async function buildLiveOwnerPortal(
  db: SupabaseClient,
  organizationId: string,
  ownerId: string,
  options: { aiConfigured: boolean; preview: boolean },
): Promise<OwnerPortalPayload | { error: string; status: number }> {
  const [ownerRow, homeRows, orgRow] = await Promise.all([
    db.from("owners").select("id, full_name, email, minimum_reserve_cents, disbursement_day").eq("id", ownerId).eq("organization_id", organizationId).maybeSingle(),
    db.from("homes").select("id, address1, city, state, property_type, monthly_rent_cents, reserve_balance_cents, health_status").eq("organization_id", organizationId).eq("owner_id", ownerId).order("address1"),
    db.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
  ]);
  if (ownerRow.error || homeRows.error) return { error: (ownerRow.error || homeRows.error)!.message, status: 500 };
  if (!ownerRow.data) return { error: "Owner not found", status: 404 };
  const homeIds = (homeRows.data ?? []).map((row) => row.id);

  const [leaseRows, maintenanceRows, layoutRow, metricRows, allEntries] = await Promise.all([
    homeIds.length
      ? db.from("leases").select("home_id, ends_on, rent_cents, balance_cents, status, tenants(full_name)").in("home_id", homeIds).in("status", ["active", "notice"])
      : Promise.resolve({ data: [] as any[], error: null }),
    homeIds.length
      ? db.from("maintenance_requests").select("id, home_id, title, status, priority, estimated_cost_cents, owner_approval_required").in("home_id", homeIds).order("opened_at", { ascending: false })
      : Promise.resolve({ data: [] as any[], error: null }),
    db.from("owner_dashboard_layouts").select("layout").eq("owner_id", ownerId).maybeSingle(),
    db.from("owner_custom_metrics").select("*").eq("owner_id", ownerId).order("created_at"),
    listLiveEntries(db, organizationId),
  ]);
  let entries = allEntries.filter((row) => row.ownerId === ownerId || (row.homeId && homeIds.includes(row.homeId)));
  // Safety net for demo organizations created before the full seed existed: fill the operating
  // history once so the owner portal is not a set of zeroed money metrics. Sandboxes created by
  // the persona switcher already have it and skip this branch.
  if (!entries.length && homeIds.length) {
    const org = await db.from("organizations").select("slug").eq("id", organizationId).maybeSingle();
    if (isDemoOrganizationSlug(org.data?.slug)) {
      try {
        const inserted = await seedDemoOperatingHistory(db, organizationId);
        if (inserted) {
          const refreshed = await listLiveEntries(db, organizationId);
          entries = refreshed.filter((row) => row.ownerId === ownerId || (row.homeId && homeIds.includes(row.homeId)));
        }
      } catch {
        // A ledger that predates the books columns still loads; it just stays empty.
      }
    }
  }
  const held = depositsHeldByHome(entries);

  const homes: OwnerHome[] = (homeRows.data ?? []).map((row) => {
    const lease = (leaseRows.data ?? []).find((item) => item.home_id === row.id);
    const tenant = lease ? (Array.isArray(lease.tenants) ? lease.tenants[0] : lease.tenants) : null;
    return {
      id: row.id,
      address1: row.address1,
      city: row.city,
      state: row.state,
      type: isPropertyType(row.property_type) ? row.property_type : "single_family",
      rentCents: lease?.rent_cents || row.monthly_rent_cents || 0,
      reserveCents: row.reserve_balance_cents || 0,
      health: row.health_status || "good",
      occupied: Boolean(lease),
      tenantName: tenant?.full_name || null,
      leaseEnds: lease?.ends_on || null,
      rentOutstandingCents: lease?.balance_cents || 0,
      depositsHeldCents: held.get(row.id) || 0,
    };
  });

  const maintenance: OwnerMaintenance[] = (maintenanceRows.data ?? []).map((row) => ({
    id: row.id,
    homeId: row.home_id,
    title: row.title,
    status: statusLabel[row.status] || row.status,
    priority: row.priority === "emergency" ? "Emergency" : row.priority === "high" ? "High" : "Normal",
    estimateCents: row.estimated_cost_cents || 0,
    needsOwnerApproval: Boolean(row.owner_approval_required) && row.status === "authorize",
  }));

  return {
    mode: "live",
    owner: {
      id: ownerRow.data.id,
      name: ownerRow.data.full_name,
      email: ownerRow.data.email,
      reserveFloorCents: ownerRow.data.minimum_reserve_cents || 0,
      disbursementDay: ownerRow.data.disbursement_day || 10,
      managerName: orgRow.data?.name || null,
    },
    homes,
    entries,
    maintenance,
    layout: parseLayout(layoutRow.data?.layout),
    customMetrics: (metricRows.data ?? []).map(mapMetric),
    aiConfigured: options.aiConfigured,
    preview: options.preview,
  };
}

export async function saveLiveLayout(db: SupabaseClient, organizationId: string, ownerId: string, userId: string, layout: DashboardLayout) {
  const { error } = await db.from("owner_dashboard_layouts").upsert({ owner_id: ownerId, organization_id: organizationId, layout, updated_by: userId, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return layout;
}

export async function addLiveCustomMetric(db: SupabaseClient, organizationId: string, ownerId: string, userId: string, prompt: string, definition: MetricDefinition) {
  const { data, error } = await db.from("owner_custom_metrics").insert({
    organization_id: organizationId,
    owner_id: ownerId,
    title: definition.title,
    prompt,
    expression: definition.expression,
    format: definition.format,
    explanation: definition.explanation,
    scope: definition.scope || null,
    period: definition.period || null,
    created_by: userId,
  }).select("*").single();
  if (error) throw new Error(error.message);
  return mapMetric(data);
}

export async function removeLiveCustomMetric(db: SupabaseClient, ownerId: string, id: string) {
  const { error, count } = await db.from("owner_custom_metrics").delete({ count: "exact" }).eq("id", id).eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
  return Boolean(count);
}
