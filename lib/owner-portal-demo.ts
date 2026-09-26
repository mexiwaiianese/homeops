import { homes, initialMaintenance, owners, tenants } from "@/lib/data";
import { booksHomes, listDemoEntries, syncDemoLedgerFromCharges } from "@/lib/books-demo";
import { listDemoCharges } from "@/lib/rent-demo";
import type { BookEntry } from "@/lib/books";
import {
  type CustomMetric,
  type DashboardLayout,
  type MetricDefinition,
  type OwnerHome,
  type OwnerMaintenance,
  type OwnerPortalPayload,
  type OwnerProfile,
} from "@/lib/owner-portal";

type Store = { layouts: Map<string, DashboardLayout>; metrics: Map<string, CustomMetric[]> };

const store: Store =
  ((globalThis as typeof globalThis & { __homeopsOwnerPortal?: Store }).__homeopsOwnerPortal ??= {
    layouts: new Map(),
    metrics: new Map(),
  });

function token(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function demoOwnerProfile(ownerId: string): OwnerProfile | null {
  const owner = owners.find((row) => row.id === ownerId);
  if (!owner) return null;
  return { id: owner.id, name: owner.name, email: owner.email, reserveFloorCents: Math.round(owner.reserve * 100), disbursementDay: parseInt(owner.disbursement, 10) || 10, managerName: "HomeOps Management" };
}

export function depositsHeldByHome(entries: BookEntry[]) {
  const held = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.homeId) continue;
    if (entry.kind === "deposit_hold") held.set(entry.homeId, (held.get(entry.homeId) || 0) + entry.amountCents);
    if (entry.kind === "deposit_return") held.set(entry.homeId, Math.max(0, (held.get(entry.homeId) || 0) - entry.amountCents));
  }
  return held;
}

export function demoOwnerHomes(ownerId: string, entries: BookEntry[]): OwnerHome[] {
  const held = depositsHeldByHome(entries);
  const books = booksHomes();
  return homes
    .filter((home) => home.ownerId === ownerId)
    .map((home) => {
      const tenant = tenants.find((row) => row.id === home.tenantId);
      const book = books.find((row) => row.id === home.id);
      return {
        id: home.id,
        address1: home.address,
        city: book?.city || home.city,
        state: book?.state || "UT",
        type: home.type,
        rentCents: Math.round(home.rent * 100),
        reserveCents: Math.round(home.reserve * 100),
        health: home.health,
        occupied: Boolean(tenant),
        tenantName: tenant?.name || null,
        leaseEnds: home.leaseEnds,
        rentOutstandingCents: Math.round((tenant?.balance || 0) * 100),
        depositsHeldCents: held.get(home.id) || Math.round(home.rent * 100), // demo: one month's rent held
      };
    });
}

export function demoOwnerMaintenance(homeIds: string[]): OwnerMaintenance[] {
  return initialMaintenance
    .filter((row) => homeIds.includes(row.homeId))
    .map((row) => ({
      id: row.id,
      homeId: row.homeId,
      title: row.title,
      status: row.status,
      priority: row.priority,
      estimateCents: Math.round((row.estimate || 0) * 100),
      needsOwnerApproval: row.status === "Authorize",
    }));
}

export function buildDemoOwnerPortal(ownerId: string, options: { aiConfigured: boolean; preview: boolean }): OwnerPortalPayload | null {
  const owner = demoOwnerProfile(ownerId);
  if (!owner) return null;
  syncDemoLedgerFromCharges(listDemoCharges());
  const allEntries = listDemoEntries();
  const ownerHomes = demoOwnerHomes(ownerId, allEntries);
  const homeIds = new Set(ownerHomes.map((home) => home.id));
  const entries = allEntries.filter((row) => row.ownerId === ownerId || (row.homeId && homeIds.has(row.homeId)));
  return {
    mode: "demo",
    owner,
    homes: ownerHomes,
    entries,
    maintenance: demoOwnerMaintenance([...homeIds]),
    layout: store.layouts.get(ownerId) || null,
    customMetrics: store.metrics.get(ownerId) || [],
    aiConfigured: options.aiConfigured,
    preview: options.preview,
  };
}

export function saveDemoLayout(ownerId: string, layout: DashboardLayout) {
  store.layouts.set(ownerId, layout);
  return layout;
}

export function addDemoCustomMetric(ownerId: string, prompt: string, definition: MetricDefinition): CustomMetric {
  const metric: CustomMetric = { ...definition, id: token("metric"), prompt, createdAt: new Date().toISOString() };
  store.metrics.set(ownerId, [...(store.metrics.get(ownerId) || []), metric]);
  return metric;
}

export function removeDemoCustomMetric(ownerId: string, id: string) {
  const current = store.metrics.get(ownerId) || [];
  const next = current.filter((metric) => metric.id !== id);
  store.metrics.set(ownerId, next);
  return current.length !== next.length;
}
