import { randomBytes } from "crypto";
import { homes } from "@/lib/data";
import { listDemoListings } from "@/lib/listing-demo";
import { registerDemoPortalTenant } from "@/lib/tenant-demo";
import {
  DEFAULT_APPLICATION_FEE_CENTS,
  type ApplicationFeeStatus,
  type ApplicationStatus,
  type PublicListing,
  type RentalApplication,
  type ScreeningStatus,
} from "@/lib/applications";

type Store = {
  tokens: Map<string, string>;
  applications: Map<string, RentalApplication>;
  seeded: boolean;
};

const store: Store =
  ((globalThis as typeof globalThis & { __homeopsApplications?: Store }).__homeopsApplications ??= {
    tokens: new Map(),
    applications: new Map(),
    seeded: false,
  });

function seedIfNeeded() {
  if (store.seeded) return;
  store.seeded = true;
  const listing = listDemoListings().find((row) => row.id === "lst-h2");
  if (!listing) return;
  ensureDemoApplyToken(listing.id);
  const row: RentalApplication = {
    id: "app-demo-1",
    listingId: listing.id,
    homeId: listing.homeId,
    address: listing.address,
    headline: listing.headline,
    status: "submitted",
    fullName: "Jordan Hale",
    email: "jordan.hale@example.com",
    phone: "(555) 010-2200",
    householdSize: 2,
    occupants: ["Jordan Hale", "Alex Hale"],
    currentAddress: "88 Current St, Example City UT",
    landlordName: "Pat Nguyen",
    landlordPhone: "(555) 010-2211",
    currentRentCents: 165000,
    reasonForMove: "Closer to work",
    employer: "Example County Schools",
    jobTitle: "Teacher",
    monthlyIncomeCents: 520000,
    employmentLength: "4 years",
    pets: "One cat",
    vehicles: "2018 Honda Civic",
    desiredMoveIn: listing.availableOn,
    screeningConsent: true,
    feeCents: DEFAULT_APPLICATION_FEE_CENTS,
    feeStatus: "paid",
    screeningStatus: "not_started",
    screeningProvider: null,
    screeningNotes: null,
    managerNotes: null,
    tenantId: null,
    leaseId: null,
    createdAt: new Date().toISOString(),
    decidedAt: null,
  };
  store.applications.set(row.id, row);
}

export function ensureDemoApplyToken(listingId: string) {
  seedIfNeeded();
  const existing = [...store.tokens.entries()].find(([, id]) => id === listingId);
  if (existing) return existing[0];
  const token = randomBytes(18).toString("hex");
  store.tokens.set(token, listingId);
  return token;
}

export function demoApplyTokenFor(listingId: string) {
  return ensureDemoApplyToken(listingId);
}

function publicFromListing(listingId: string): PublicListing | null {
  const listing = listDemoListings().find((row) => row.id === listingId);
  if (!listing) return null;
  return {
    headline: listing.headline,
    address: listing.address,
    city: `${listing.city}, ${listing.state}`,
    rentCents: listing.rentCents,
    depositCents: listing.depositCents,
    availableOn: listing.availableOn,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    petPolicy: listing.petPolicy,
    leaseTerm: listing.leaseTerm,
    feeCents: DEFAULT_APPLICATION_FEE_CENTS,
    status: listing.status,
  };
}

export function publicDemoListing(token: string) {
  seedIfNeeded();
  const listingId = store.tokens.get(token);
  if (!listingId) return null;
  const listing = publicFromListing(listingId);
  return listing ? { listing, listingId } : null;
}

export function submitDemoApplication(token: string, input: Omit<RentalApplication, "id" | "listingId" | "homeId" | "address" | "headline" | "status" | "feeCents" | "feeStatus" | "screeningStatus" | "screeningProvider" | "screeningNotes" | "managerNotes" | "tenantId" | "leaseId" | "createdAt" | "decidedAt">) {
  const found = publicDemoListing(token);
  if (!found) return { error: "This application link is not valid.", status: 404 as const };
  const listing = listDemoListings().find((row) => row.id === found.listingId);
  if (!listing) return { error: "This listing is no longer available.", status: 404 as const };
  const id = `app-${randomBytes(6).toString("hex")}`;
  const feeCents = found.listing.feeCents;
  const row: RentalApplication = {
    ...input,
    id,
    listingId: listing.id,
    homeId: listing.homeId,
    address: listing.address,
    headline: listing.headline,
    status: "submitted",
    feeCents,
    feeStatus: feeCents === 0 ? "waived" : "unpaid",
    screeningStatus: "not_started",
    screeningProvider: null,
    screeningNotes: null,
    managerNotes: null,
    tenantId: null,
    leaseId: null,
    createdAt: new Date().toISOString(),
    decidedAt: null,
  };
  store.applications.set(id, row);
  return { application: row };
}

export function getDemoApplication(id: string) {
  seedIfNeeded();
  return store.applications.get(id) || null;
}

export function listDemoApplications() {
  seedIfNeeded();
  return [...store.applications.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function markDemoApplicationFee(id: string, status: ApplicationFeeStatus, intentId?: string | null) {
  const row = getDemoApplication(id);
  if (!row) return null;
  if (row.feeStatus === "paid" && status === "paid") return row;
  row.feeStatus = status;
  return row;
}

export function updateDemoApplication(id: string, patch: Partial<Pick<RentalApplication, "status" | "screeningStatus" | "screeningNotes" | "screeningProvider" | "managerNotes" | "feeStatus" | "decidedAt" | "tenantId" | "leaseId">>) {
  const row = getDemoApplication(id);
  if (!row) return null;
  Object.assign(row, patch);
  return row;
}

export function leaseDemoApplication(id: string) {
  const row = getDemoApplication(id);
  if (!row) return { error: "Application not found", status: 404 as const };
  if (row.tenantId && row.leaseId) return { application: row, created: false as const };
  if (row.status !== "approved") return { error: "Approve the application before creating a lease.", status: 409 as const };
  const home = homes.find((item) => item.id === row.homeId);
  const tenantId = `t-${randomBytes(4).toString("hex")}`;
  const leaseId = `lease-${randomBytes(4).toString("hex")}`;
  registerDemoPortalTenant({
    id: tenantId,
    name: row.fullName,
    email: row.email,
    phone: row.phone || "",
    home: home?.address || row.address,
    city: home?.city || "",
    homeId: row.homeId,
  });
  row.tenantId = tenantId;
  row.leaseId = leaseId;
  row.status = "leased";
  row.decidedAt = row.decidedAt || new Date().toISOString();
  return { application: row, created: true as const };
}

export function setDemoScreening(id: string, status: ScreeningStatus, notes: string | null, provider: string | null) {
  const next = rowStatus(status);
  return updateDemoApplication(id, {
    screeningStatus: status,
    screeningNotes: notes,
    screeningProvider: provider,
    ...(next ? { status: next } : {}),
  });
}

function rowStatus(screening: ScreeningStatus): ApplicationStatus | undefined {
  if (screening === "requested" || screening === "review") return "screening";
  return undefined;
}
