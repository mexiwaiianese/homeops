import { cityStateMatch, postalInArea, tradeQueriesForArea, zipsForRecruitmentArea } from "@/lib/area-zips";
import { buildVendorFingerprint } from "@/lib/vendors";

export const RECRUITMENT_TRADES = [
  { slug: "hvac", name: "HVAC", query: "HVAC contractor" },
  { slug: "plumbing", name: "Plumbing", query: "plumber" },
  { slug: "electrical", name: "Electrical", query: "electrician" },
  { slug: "appliance", name: "Appliance Repair", query: "appliance repair" },
  { slug: "general-maintenance", name: "General Maintenance", query: "handyman" },
  { slug: "landscaping", name: "Landscaping", query: "landscaper" },
  { slug: "roofing", name: "Roofing", query: "roofing contractor" },
  { slug: "pest-control", name: "Pest Control", query: "pest control" },
  { slug: "locksmith", name: "Locksmith", query: "locksmith" },
  { slug: "water-damage", name: "Water / Restoration", query: "water damage restoration" },
] as const;

export type RecruitmentTradeSlug = (typeof RECRUITMENT_TRADES)[number]["slug"];

export type DiscoveredProvider = {
  source: "google_places" | "demo_catalog" | "manual";
  sourcePlaceId: string;
  name: string;
  categorySlug: RecruitmentTradeSlug;
  categoryName: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  publicRating: number | null;
  reviewCount: number;
  publicRankScore: number;
  independentFitScore: number;
  mapsUrl: string | null;
  editorialSummary: string | null;
};

export const INDEPENDENT_INVITE_DEFAULTS = {
  minRating: 4.4,
  minReviews: 8,
  maxReviews: 250,
};

const SCALED_BRAND_PATTERNS = [
  /\byes!?(?:\s|,|$)/i,
  /the yes man/i,
  /western heating/i,
  /\bmr\.?\s*appliance\b/i,
  /\bservpro\b/i,
  /\borkin\b/i,
  /\bterminix\b/i,
  /roto-?rooter/i,
  /\bneighborly\b/i,
  /one hour heating/i,
  /service experts/i,
  /brothers locksmith/i,
  /\bsolterra\b/i,
  /^valley plumbing/i,
];

export function isScaledBrand(name: string) {
  const trimmed = name.trim();
  if (/^utah valley plumbing/i.test(trimmed)) return false;
  return SCALED_BRAND_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function publicReputationScore(input: {
  rating: number | null;
  reviewCount: number;
  hasWebsite?: boolean;
}) {
  const rating = input.rating ?? 0;
  const reviews = Math.max(0, input.reviewCount || 0);
  const sample = reviews >= 20 ? 1 : reviews >= 8 ? 0.7 : reviews >= 3 ? 0.4 : 0.15;
  const base = rating * Math.log1p(reviews) * sample;
  return Math.round((base + (input.hasWebsite ? 0.15 : 0)) * 100) / 100;
}

/** Peaks for owner-operators with enough proof to be real, not call-center volume. */
export function independentSizeFit(reviewCount: number) {
  const count = Math.max(0, reviewCount);
  if (count < 8) return 0.15;
  if (count <= 25) return 0.6 + ((count - 8) / 17) * 0.4;
  if (count <= 90) return 1;
  if (count <= 180) return 1 - ((count - 90) / 90) * 0.4;
  if (count <= 400) return 0.6 - ((count - 180) / 220) * 0.45;
  return 0.08;
}

export function independentFitScore(input: {
  name?: string;
  rating: number | null;
  reviewCount: number;
  hasWebsite?: boolean;
}) {
  if (input.name && isScaledBrand(input.name)) return 0;
  const score = (input.rating ?? 0) * independentSizeFit(input.reviewCount) * 10 + (input.hasWebsite ? 0.2 : 0);
  return Math.round(score * 100) / 100;
}

export function isIndependentInviteCandidate(input: {
  name: string;
  rating: number | null;
  reviewCount: number;
  minRating?: number;
  minReviews?: number;
  maxReviews?: number;
}) {
  if (isScaledBrand(input.name)) return false;
  const minRating = input.minRating ?? INDEPENDENT_INVITE_DEFAULTS.minRating;
  const minReviews = input.minReviews ?? INDEPENDENT_INVITE_DEFAULTS.minReviews;
  const maxReviews = input.maxReviews ?? INDEPENDENT_INVITE_DEFAULTS.maxReviews;
  if ((input.rating ?? 0) < minRating) return false;
  if (input.reviewCount < minReviews || input.reviewCount > maxReviews) return false;
  return true;
}

export function inviteSkipReason(input: {
  name: string;
  rating: number | null;
  reviewCount: number;
}) {
  if (isScaledBrand(input.name)) return "Chain / franchise";
  if ((input.rating ?? 0) < INDEPENDENT_INVITE_DEFAULTS.minRating) return "Rating below 4.4";
  if (input.reviewCount < INDEPENDENT_INVITE_DEFAULTS.minReviews) return "Too few reviews";
  if (input.reviewCount > INDEPENDENT_INVITE_DEFAULTS.maxReviews) return "High-volume shop";
  return null;
}

export function rankDiscoveredProviders(rows: DiscoveredProvider[]) {
  return [...rows].sort((a, b) => {
    if (b.independentFitScore !== a.independentFitScore) return b.independentFitScore - a.independentFitScore;
    if (b.publicRankScore !== a.publicRankScore) return b.publicRankScore - a.publicRankScore;
    return a.name.localeCompare(b.name);
  });
}

export function groupDiscoveredProviders(rows: DiscoveredProvider[]) {
  const groups = new Map<string, DiscoveredProvider[]>();
  for (const row of rankDiscoveredProviders(rows)) {
    const list = groups.get(row.categorySlug) ?? [];
    list.push(row);
    groups.set(row.categorySlug, list);
  }
  return RECRUITMENT_TRADES.map((trade) => ({
    slug: trade.slug,
    name: trade.name,
    providers: groups.get(trade.slug) ?? [],
  })).filter((group) => group.providers.length);
}

export function prospectFingerprint(input: {
  name: string;
  phone?: string | null;
  email?: string | null;
  postalCode?: string | null;
}) {
  return buildVendorFingerprint(input);
}

export function parseUsPhone(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length === 10 ? digits : null;
}

export function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function providerInTargetArea(
  row: { city?: string | null; state?: string | null; postalCode?: string | null },
  input: { city?: string; county?: string; state: string; zips: string[]; countyCities?: string[] },
) {
  if (input.zips.length && postalInArea(row.postalCode, input.zips)) return true;
  if (input.county && input.countyCities?.length) {
    return input.countyCities.some((name) => cityStateMatch(row, name, input.state));
  }
  return Boolean(input.city && cityStateMatch(row, input.city, input.state));
}

export function parseOtherProviderTypes(value: string | string[] | null | undefined) {
  const parts = Array.isArray(value) ? value : String(value ?? "").split(/[,;\n]+/);
  return parts.map((part) => part.trim()).filter(Boolean);
}

export async function discoverProvidersForArea(input: {
  city?: string;
  county?: string;
  state: string;
  trades?: RecruitmentTradeSlug[];
  extraQueries?: string[];
  catalog: DiscoveredProvider[];
}) {
  const city = (input.city ?? "").trim();
  const county = (input.county ?? "").trim();
  const state = input.state.trim().toUpperCase().slice(0, 2);
  const area = await zipsForRecruitmentArea({ city, county, state });
  const extras = parseOtherProviderTypes(input.extraQueries);
  const selected = input.trades;
  const trades =
    selected === undefined || (selected.length === 0 && extras.length === 0)
      ? [...RECRUITMENT_TRADES]
      : RECRUITMENT_TRADES.filter((trade) => selected.includes(trade.slug));
  const place = area.place || city || county;
  const queries = tradeQueriesForArea({
    queries: [...trades.map((trade) => trade.query), ...extras],
    city: place,
    state,
    zips: area.zips,
  });
  const providers = rankDiscoveredProviders(
    input.catalog.filter((row) =>
      trades.some((trade) => trade.slug === row.categorySlug) &&
      providerInTargetArea(row, { city, county, state, zips: area.zips, countyCities: area.cities }),
    ),
  );
  return {
    providers,
    source: "demo_catalog" as const,
    zips: area.zips,
    queries,
    place,
    city,
    county,
    areaSource: area.source,
    warning: area.zips.length
      ? undefined
      : `No ZIP codes found for ${place}, ${state}. Ranked by name match only.`,
  };
}
