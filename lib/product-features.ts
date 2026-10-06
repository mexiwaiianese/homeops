export const FEATURE_KEYS = [
  "operations",
  "listings",
  "applications",
  "payments",
  "books",
  "approved_vendors",
  "owner_portal",
  "tenant_portal",
  "vendor_portal",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type FeatureMap = Record<FeatureKey, boolean>;

export const FEATURE_CATALOG: Array<{ key: FeatureKey; label: string; description: string }> = [
  { key: "operations", label: "Operations desk", description: "Homes, owners, tenants, and the maintenance command center." },
  { key: "listings", label: "Rental listings", description: "Draft listings and syndicate to ILS feeds." },
  { key: "applications", label: "Applications", description: "Rental applications. Screening reports are billed per adult at the partner's price." },
  { key: "payments", label: "Rent payments", description: "Charges, pay links, and collection status." },
  { key: "books", label: "Books", description: "Property-level operating history and owner reports." },
  { key: "approved_vendors", label: "Approved vendors", description: "Internal vendor directory, eligibility, and reverse auctions." },
  { key: "owner_portal", label: "Owner portal", description: "Owner dashboard, cash flow, and property health." },
  { key: "tenant_portal", label: "Tenant portal", description: "Passwordless tenant access for rent and requests." },
  { key: "vendor_portal", label: "Vendor desk", description: "Vendor jobs, bids, and field crew links." },
];

export type SubscriptionPackage = {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  monthlyCents: number;
  features: FeatureMap;
  isDefault: boolean;
};

export const ALL_FEATURES_ON: FeatureMap = Object.fromEntries(FEATURE_KEYS.map((key) => [key, true])) as FeatureMap;

export const ALL_FEATURES_OFF: FeatureMap = Object.fromEntries(FEATURE_KEYS.map((key) => [key, false])) as FeatureMap;

function mapOf(on: FeatureKey[]): FeatureMap {
  const next = { ...ALL_FEATURES_OFF };
  next.operations = true;
  for (const key of on) next[key] = true;
  return next;
}

export const DEFAULT_PACKAGES: SubscriptionPackage[] = [
  {
    id: "core",
    name: "Core",
    description: "Operations desk, owner portal, and vendor desk. Free ACH on included properties.",
    sortOrder: 1,
    monthlyCents: 9900,
    isDefault: true,
    features: mapOf(["owner_portal", "vendor_portal"]),
  },
  {
    id: "operations",
    name: "Operations",
    description: "Adds listings, applications, rent collection, and the approved vendor network. Includes ongoing development time for automations. Free ACH on included properties.",
    sortOrder: 2,
    monthlyCents: 14900,
    isDefault: false,
    features: mapOf(["listings", "applications", "payments", "approved_vendors", "owner_portal", "vendor_portal"]),
  },
  {
    id: "portfolio",
    name: "Portfolio",
    description: "Adds books and the tenant portal. Includes ongoing development time for personalization and new feature creation. Free ACH on included properties.",
    sortOrder: 3,
    monthlyCents: 29900,
    isDefault: false,
    features: { ...ALL_FEATURES_ON },
  },
];

export function emptyFeatureMap(): FeatureMap {
  return { ...ALL_FEATURES_OFF };
}

export function parseFeatureMap(value: unknown): FeatureMap {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const next = { ...ALL_FEATURES_OFF };
  for (const key of FEATURE_KEYS) {
    if (raw[key] === true) next[key] = true;
    if (raw[key] === false) next[key] = false;
  }
  return next;
}

export type FeatureOverrides = Partial<Record<FeatureKey, boolean>>;

export function parseOverrides(value: unknown): FeatureOverrides {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const next: FeatureOverrides = {};
  for (const key of FEATURE_KEYS) {
    if (raw[key] === true) next[key] = true;
    if (raw[key] === false) next[key] = false;
  }
  return next;
}

export function resolveFeatures(base: FeatureMap, overrides?: FeatureOverrides | null): FeatureMap {
  const next = { ...base };
  if (overrides) {
    for (const key of FEATURE_KEYS) {
      if (overrides[key] === true) next[key] = true;
      if (overrides[key] === false) next[key] = false;
    }
  }
  next.operations = next.operations || Object.values(next).some(Boolean);
  return next;
}

export function packageById(id: string | null | undefined, packages: SubscriptionPackage[] = DEFAULT_PACKAGES) {
  return packages.find((row) => row.id === id) || packages.find((row) => row.isDefault) || packages[0];
}

export function opsHomePath(mode?: string | null) {
  return mode === "demo" ? "/demo" : "/app";
}

export function featureEnabled(features: FeatureMap | null | undefined, key: FeatureKey) {
  if (!features) return true;
  return features[key] !== false;
}

export function moneyCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}
