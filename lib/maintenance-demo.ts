import { homes, initialMaintenance, tenants, type MaintenanceStatus } from "@/lib/data";

// Demo maintenance used to be a frozen seed array. The tenant portal needs to open new
// work orders that the property manager board, auctions, and auto-assign can all see,
// so demo maintenance now lives in one mutable server-side store seeded from lib/data.

export type DemoMaintenance = (typeof initialMaintenance)[number] & {
  tenantId: string | null;
  description: string | null;
  availability: string | null;
  category: string | null;
  source: "seed" | "tenant_portal";
  openedAt: string;
  updatedAt: string;
};

type Store = { rows: Map<string, DemoMaintenance> };

const store: Store =
  ((globalThis as typeof globalThis & { __homeopsMaintenance?: Store }).__homeopsMaintenance ??= {
    rows: new Map(),
  });

function seedIfNeeded() {
  if (store.rows.size) return;
  const now = Date.now();
  initialMaintenance.forEach((row, index) => {
    const tenant = tenants.find((t) => t.name === row.tenant);
    const openedAt = new Date(now - (index + 1) * 36 * 60 * 60 * 1000).toISOString();
    store.rows.set(row.id, {
      ...row,
      tenantId: tenant?.id ?? null,
      description: row.note,
      availability: null,
      category: null,
      source: "seed",
      openedAt,
      updatedAt: openedAt,
    });
  });
}

seedIfNeeded();

/** Drop every demo request (seeded and tenant-created); the next read re-seeds the board. */
export function resetDemoMaintenance() {
  store.rows.clear();
}

export function listDemoMaintenance() {
  seedIfNeeded();
  return [...store.rows.values()].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
}

export function getDemoMaintenance(id: string) {
  seedIfNeeded();
  return store.rows.get(id) || null;
}

export function listDemoMaintenanceForTenant(tenantId: string) {
  return listDemoMaintenance().filter((row) => row.tenantId === tenantId);
}

export function updateDemoMaintenance(id: string, patch: Partial<DemoMaintenance>) {
  const row = getDemoMaintenance(id);
  if (!row) return null;
  Object.assign(row, patch, { updatedAt: new Date().toISOString() });
  return row;
}

export function createDemoMaintenance(input: {
  tenantId: string;
  title: string;
  description: string;
  emergency?: boolean;
  availability?: string | null;
  category?: string | null;
}) {
  seedIfNeeded();
  const tenant = tenants.find((row) => row.id === input.tenantId);
  const home = homes.find((row) => row.tenantId === input.tenantId);
  if (!tenant || !home) return { error: "We could not find your home on file.", status: 404 as const };
  const id = `m-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const row: DemoMaintenance = {
    id,
    homeId: home.id,
    title: input.title.trim().slice(0, 140),
    tenant: tenant.name,
    tenantId: tenant.id,
    priority: input.emergency ? "Emergency" : "Normal",
    status: "Diagnose" as MaintenanceStatus,
    estimate: 0,
    note: input.description.trim().slice(0, 240) || "Reported from the tenant portal.",
    description: input.description.trim().slice(0, 5000),
    availability: input.availability?.trim() || null,
    category: input.category || null,
    vendorId: null,
    vendorName: null,
    source: "tenant_portal",
    openedAt: now,
    updatedAt: now,
  };
  store.rows.set(id, row);
  return { request: row };
}
