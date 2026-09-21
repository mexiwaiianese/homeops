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
  source: "google_places" | "demo_catalog";
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

type PlacesSearchResult = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  editorialSummary?: { text?: string };
};

function parseAddress(formatted?: string, fallbackCity?: string, fallbackState?: string) {
  const parts = (formatted ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  const postal = (formatted ?? "").match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] ?? null;
  return {
    address1: parts[0] || null,
    city: parts.length >= 3 ? parts[parts.length - 3] : fallbackCity || null,
    state: fallbackState || parts.find((part) => /^[A-Z]{2}$/.test(part.split(" ")[0]))?.slice(0, 2) || null,
    postalCode: postal,
  };
}

export async function discoverProvidersFromPlaces(input: {
  city: string;
  state: string;
  trades?: RecruitmentTradeSlug[];
}): Promise<{ providers: DiscoveredProvider[]; source: "google_places" | "unavailable"; error?: string }> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { providers: [], source: "unavailable", error: "GOOGLE_PLACES_API_KEY is not configured" };

  const trades = RECRUITMENT_TRADES.filter((trade) => !input.trades?.length || input.trades.includes(trade.slug));
  const providers: DiscoveredProvider[] = [];

  for (const trade of trades) {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri,places.editorialSummary",
      },
      body: JSON.stringify({
        textQuery: `${trade.query} in ${input.city}, ${input.state}`,
        pageSize: 20,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        providers: [],
        source: "unavailable",
        error: typeof body.error?.message === "string" ? body.error.message : "Places lookup failed",
      };
    }
    for (const place of (body.places ?? []) as PlacesSearchResult[]) {
      const name = place.displayName?.text?.trim();
      if (!name) continue;
      const address = parseAddress(place.formattedAddress, input.city, input.state);
      const reviewCount = Number(place.userRatingCount ?? 0);
      const rating = place.rating == null ? null : Number(place.rating);
      providers.push({
        source: "google_places",
        sourcePlaceId: place.id || `${name}|${trade.slug}`,
        name,
        categorySlug: trade.slug,
        categoryName: trade.name,
        phone: place.nationalPhoneNumber || null,
        email: null,
        website: place.websiteUri || null,
        address1: address.address1,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        publicRating: rating,
        reviewCount,
        publicRankScore: publicReputationScore({
          rating,
          reviewCount,
          hasWebsite: Boolean(place.websiteUri),
        }),
        independentFitScore: independentFitScore({
          name,
          rating,
          reviewCount,
          hasWebsite: Boolean(place.websiteUri),
        }),
        mapsUrl: place.googleMapsUri || null,
        editorialSummary: place.editorialSummary?.text || null,
      });
    }
  }

  return { providers: rankDiscoveredProviders(providers), source: "google_places" };
}
