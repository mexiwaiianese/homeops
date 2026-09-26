import { independentFitScore, publicReputationScore, rankDiscoveredProviders, type DiscoveredProvider } from "@/lib/vendor-prospects";

const catalog: Array<Omit<DiscoveredProvider, "publicRankScore" | "independentFitScore" | "source">> = [
  { sourcePlaceId: "demo-hvac-1", name: "Wasatch Comfort Heating", categorySlug: "hvac", categoryName: "HVAC", phone: "(385) 555-0140", email: "dispatch@wasatchcomfort.example", website: "https://wasatchcomfort.example", address1: "412 Pioneer Crossing", city: "Lehi", state: "UT", postalCode: "84043", publicRating: 4.8, reviewCount: 126, mapsUrl: null, editorialSummary: "Residential HVAC service with strong after-hours mentions in public reviews." },
  { sourcePlaceId: "demo-hvac-2", name: "Alpine Air Specialists", categorySlug: "hvac", categoryName: "HVAC", phone: "(801) 555-0172", email: null, website: "https://alpineair.example", address1: "88 Center Street", city: "American Fork", state: "UT", postalCode: "84003", publicRating: 4.4, reviewCount: 41, mapsUrl: null, editorialSummary: "Public reviews mention prompt furnace repairs." },
  { sourcePlaceId: "demo-hvac-chain", name: "YES! Heating and Air", categorySlug: "hvac", categoryName: "HVAC", phone: "(801) 555-0900", email: "leads@yesheating.example", website: "https://yesheating.example", address1: "100 Call Center Way", city: "Lehi", state: "UT", postalCode: "84043", publicRating: 4.9, reviewCount: 2531, mapsUrl: null, editorialSummary: "High-volume brand. Independent-fit score is zero and auto-invite skips it." },
  { sourcePlaceId: "demo-plumb-1", name: "Jordan River Plumbing Co.", categorySlug: "plumbing", categoryName: "Plumbing", phone: "(801) 555-0194", email: "office@jordanriverplumbing.example", website: "https://jordanriverplumbing.example", address1: "210 State Street", city: "Lehi", state: "UT", postalCode: "84043", publicRating: 4.7, reviewCount: 88, mapsUrl: null, editorialSummary: "Water heater and leak repair reviews cluster around same-day service." },
  { sourcePlaceId: "demo-elec-1", name: "Timpanogos Electric", categorySlug: "electrical", categoryName: "Electrical", phone: "(385) 555-0118", email: "jobs@timpelectric.example", website: null, address1: "55 Main Street", city: "Highland", state: "UT", postalCode: "84003", publicRating: 4.9, reviewCount: 64, mapsUrl: null, editorialSummary: "Panel and outlet work with a high public rating and modest sample." },
  { sourcePlaceId: "demo-app-1", name: "Benchland Appliance Repair", categorySlug: "appliance", categoryName: "Appliance Repair", phone: "(385) 555-0127", email: "shop@benchlandappliance.example", website: "https://benchlandappliance.example", address1: "44 Pioneer Drive", city: "Lehi", state: "UT", postalCode: "84043", publicRating: 4.9, reviewCount: 48, mapsUrl: null, editorialSummary: "Owner-operator appliance repair with a modest public sample." },
  { sourcePlaceId: "demo-app-chain", name: "Mr. Appliance of Lehi", categorySlug: "appliance", categoryName: "Appliance Repair", phone: "(801) 555-0911", email: "lehi@mrappliance.example", website: "https://mrappliance.example", address1: "800 Franchise Park", city: "Pleasant Grove", state: "UT", postalCode: "84062", publicRating: 4.6, reviewCount: 838, mapsUrl: null, editorialSummary: "National franchise. Auto-invite skips scaled brands." },
  { sourcePlaceId: "demo-maint-1", name: "Traverse Mountain Handyman", categorySlug: "general-maintenance", categoryName: "General Maintenance", phone: "(801) 555-0148", email: "hello@traversehandyman.example", website: "https://traversehandyman.example", address1: "12 Clubhouse Lane", city: "Lehi", state: "UT", postalCode: "84043", publicRating: 4.9, reviewCount: 31, mapsUrl: null, editorialSummary: "Small-shop handyman with consistent public reviews." },
  { sourcePlaceId: "demo-land-1", name: "Dry Creek Landscape", categorySlug: "landscaping", categoryName: "Landscaping", phone: "(801) 555-0133", email: "hello@drycreeklandscape.example", website: "https://drycreeklandscape.example", address1: "900 Cedar Hills Drive", city: "Cedar Hills", state: "UT", postalCode: "84062", publicRating: 4.6, reviewCount: 53, mapsUrl: null, editorialSummary: "Public reviews emphasize irrigation and seasonal cleanups." },
  { sourcePlaceId: "demo-roof-1", name: "Summit Ridge Roofing", categorySlug: "roofing", categoryName: "Roofing", phone: "(385) 555-0161", email: null, website: "https://summitridgeroofing.example", address1: "17 Industrial Park", city: "Lindon", state: "UT", postalCode: "84042", publicRating: 4.3, reviewCount: 29, mapsUrl: null, editorialSummary: "Insurance-claim roof work appears often in public comments." },
  { sourcePlaceId: "demo-pest-1", name: "Valley Safe Pest", categorySlug: "pest-control", categoryName: "Pest Control", phone: "(801) 555-0188", email: "service@valleysafepest.example", website: null, address1: "1400 North 200 East", city: "Orem", state: "UT", postalCode: "84057", publicRating: 4.5, reviewCount: 37, mapsUrl: null, editorialSummary: null },
  { sourcePlaceId: "demo-pest-chain", name: "Orkin Pest Control", categorySlug: "pest-control", categoryName: "Pest Control", phone: "(801) 555-0922", email: "orem@orkin.example", website: "https://orkin.example", address1: "325 State Street", city: "Orem", state: "UT", postalCode: "84057", publicRating: 4.6, reviewCount: 900, mapsUrl: null, editorialSummary: "National brand. Independent-fit score is zero." },
  { sourcePlaceId: "demo-lock-1", name: "North County Lock & Key", categorySlug: "locksmith", categoryName: "Locksmith", phone: "(385) 555-0104", email: null, website: null, address1: "3 Commerce Drive", city: "Lehi", state: "UT", postalCode: "84043", publicRating: 4.2, reviewCount: 12, mapsUrl: null, editorialSummary: "Smaller public sample; lockout reviews are mixed but usable." },
  { sourcePlaceId: "demo-water-1", name: "Dryline Restoration", categorySlug: "water-damage", categoryName: "Water / Restoration", phone: "(385) 555-0155", email: "dispatch@dryline.example", website: "https://dryline.example", address1: "1881 Traverse Parkway", city: "Lehi", state: "UT", postalCode: "84043", publicRating: 4.8, reviewCount: 67, mapsUrl: null, editorialSummary: "Local restoration shop with enough reviews to be real, not a call center." },
];

export const demoProspects: DiscoveredProvider[] = catalog.map((row) => ({
  ...row,
  source: "demo_catalog",
  publicRankScore: publicReputationScore({
    rating: row.publicRating,
    reviewCount: row.reviewCount,
    hasWebsite: Boolean(row.website),
  }),
  independentFitScore: independentFitScore({
    name: row.name,
    rating: row.publicRating,
    reviewCount: row.reviewCount,
    hasWebsite: Boolean(row.website),
  }),
}));

type DemoOutreachStatus = "discovered" | "invited" | "registered";
type DemoOutreach = {
  status: DemoOutreachStatus;
  inviteUrl?: string;
  registeredAt?: string;
  companyName?: string;
};

const demoOutreach: Map<string, DemoOutreach> =
  ((globalThis as typeof globalThis & { __homeopsDemoOutreach?: Map<string, DemoOutreach> }).__homeopsDemoOutreach ??= new Map());

/** Forget every invite and registration so the catalog reads as freshly discovered. */
export function resetDemoOutreach() {
  demoOutreach.clear();
}

export function demoInviteToken(sourcePlaceId: string) {
  return sourcePlaceId.startsWith("demo-") ? sourcePlaceId : `demo-${sourcePlaceId}`;
}

export function findDemoProspectByToken(token: string) {
  if (!token.startsWith("demo-")) return null;
  return demoProspects.find((row) => row.sourcePlaceId === token || demoInviteToken(row.sourcePlaceId) === token) || null;
}

export function markDemoInvited(sourcePlaceId: string, inviteUrl: string) {
  const current = demoOutreach.get(sourcePlaceId);
  if (current?.status === "registered") return current;
  const next: DemoOutreach = { status: "invited", inviteUrl, registeredAt: current?.registeredAt, companyName: current?.companyName };
  demoOutreach.set(sourcePlaceId, next);
  return next;
}

export function markDemoRegistered(token: string, companyName: string) {
  const prospect = findDemoProspectByToken(token);
  if (!prospect) return null;
  const next: DemoOutreach = {
    status: "registered",
    companyName,
    registeredAt: new Date().toISOString(),
    inviteUrl: demoOutreach.get(prospect.sourcePlaceId)?.inviteUrl,
  };
  demoOutreach.set(prospect.sourcePlaceId, next);
  return next;
}

export function getDemoOutreach(sourcePlaceId: string): DemoOutreach {
  return demoOutreach.get(sourcePlaceId) || { status: "discovered" };
}

export function demoProspectsWithOutreach() {
  return rankDiscoveredProviders(demoProspects).map((row) => ({
    ...row,
    outreach_status: getDemoOutreach(row.sourcePlaceId).status,
  }));
}
