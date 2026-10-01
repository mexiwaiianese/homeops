import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ALL_FEATURES_ON,
  DEFAULT_PACKAGES,
  parseFeatureMap,
  parseOverrides,
  packageById,
  resolveFeatures,
  type FeatureMap,
  type FeatureOverrides,
  type SubscriptionPackage,
} from "@/lib/product-features";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type PackageRow = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  monthly_cents: number;
  features: unknown;
  is_default: boolean;
};

type OrgSubRow = {
  organization_id: string;
  package_id: string;
  feature_overrides: unknown;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

type MemoryOrgSub = {
  organizationId: string;
  packageId: string;
  overrides: FeatureOverrides;
  status: string;
};

const memoryPackages: SubscriptionPackage[] =
  ((globalThis as typeof globalThis & { __homeopsPackages?: SubscriptionPackage[] }).__homeopsPackages ??=
    DEFAULT_PACKAGES.map((row) => ({ ...row, features: { ...row.features } })));

const memoryOrgSubs: Map<string, MemoryOrgSub> =
  ((globalThis as typeof globalThis & { __homeopsOrgSubs?: Map<string, MemoryOrgSub> }).__homeopsOrgSubs ??= new Map());

function fromRow(row: PackageRow): SubscriptionPackage {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    sortOrder: row.sort_order,
    monthlyCents: row.monthly_cents,
    features: parseFeatureMap(row.features),
    isDefault: row.is_default,
  };
}

export async function listPackages(admin?: SupabaseClient | null): Promise<SubscriptionPackage[]> {
  const db = admin || createSupabaseAdminClient();
  if (!db) return memoryPackages.map((row) => ({ ...row, features: { ...row.features } }));
  const { data, error } = await db.from("subscription_packages").select("*").order("sort_order");
  if (error || !data?.length) return memoryPackages.map((row) => ({ ...row, features: { ...row.features } }));
  return (data as PackageRow[]).map(fromRow);
}

export async function savePackage(input: SubscriptionPackage, admin?: SupabaseClient | null) {
  const db = admin || createSupabaseAdminClient();
  const features = parseFeatureMap(input.features);
  const next: SubscriptionPackage = {
    ...input,
    name: input.name.trim() || input.id,
    description: input.description.trim(),
    monthlyCents: Math.max(0, Math.round(input.monthlyCents)),
    sortOrder: Number(input.sortOrder) || 0,
    features,
  };
  const idx = memoryPackages.findIndex((row) => row.id === next.id);
  if (idx >= 0) memoryPackages[idx] = { ...next, features: { ...features } };
  else memoryPackages.push({ ...next, features: { ...features } });
  if (next.isDefault) {
    for (const row of memoryPackages) row.isDefault = row.id === next.id;
  }
  if (db) {
    if (next.isDefault) await db.from("subscription_packages").update({ is_default: false }).neq("id", next.id);
    const { error } = await db.from("subscription_packages").upsert({
      id: next.id,
      name: next.name,
      description: next.description,
      sort_order: next.sortOrder,
      monthly_cents: next.monthlyCents,
      features,
      is_default: next.isDefault,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  }
  return next;
}

export async function getOrgSubscription(organizationId: string, admin?: SupabaseClient | null) {
  const db = admin || createSupabaseAdminClient();
  const packages = await listPackages(db);
  if (!db) {
    const stored = memoryOrgSubs.get(organizationId);
    const pkg = packageById(stored?.packageId, packages);
    return {
      organizationId,
      packageId: pkg.id,
      package: pkg,
      overrides: stored?.overrides ?? {},
      status: stored?.status || "active",
      features: resolveFeatures(pkg.features, stored?.overrides),
    };
  }
  const { data } = await db.from("organization_subscriptions").select("*").eq("organization_id", organizationId).maybeSingle();
  const row = data as OrgSubRow | null;
  const pkg = packageById(row?.package_id, packages);
  const overrides = parseOverrides(row?.feature_overrides);
  return {
    organizationId,
    packageId: pkg.id,
    package: pkg,
    overrides,
    status: row?.status || "active",
    features: resolveFeatures(pkg.features, overrides),
    stripeCustomerId: row?.stripe_customer_id ?? null,
    stripeSubscriptionId: row?.stripe_subscription_id ?? null,
  };
}

export async function saveOrgSubscription(input: {
  organizationId: string;
  packageId: string;
  overrides?: FeatureOverrides;
  status?: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}, admin?: SupabaseClient | null) {
  const db = admin || createSupabaseAdminClient();
  const packages = await listPackages(db);
  const pkg = packageById(input.packageId, packages);
  const overrides = parseOverrides(input.overrides);
  memoryOrgSubs.set(input.organizationId, {
    organizationId: input.organizationId,
    packageId: pkg.id,
    overrides,
    status: input.status || "active",
  });
  if (db) {
    const { error } = await db.from("organization_subscriptions").upsert({
      organization_id: input.organizationId,
      package_id: pkg.id,
      feature_overrides: overrides,
      status: input.status || "active",
      stripe_customer_id: input.stripeCustomerId ?? null,
      stripe_subscription_id: input.stripeSubscriptionId ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  }
  return getOrgSubscription(input.organizationId, db);
}

export async function featuresForOrganization(organizationId: string | null | undefined, admin?: SupabaseClient | null): Promise<FeatureMap> {
  if (!organizationId) return { ...ALL_FEATURES_ON };
  const sub = await getOrgSubscription(organizationId, admin);
  return sub.features;
}

export function moneyCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}
