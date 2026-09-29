import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import {
  DEFAULT_APPLICATION_FEE_CENTS,
  type ApplicationFeeStatus,
  type ApplicationStatus,
  type PublicListing,
  type RentalApplication,
  type ScreeningStatus,
} from "@/lib/applications";

function mapApplication(row: any, listing?: any, home?: any): RentalApplication {
  const occupants = Array.isArray(row.occupants) ? row.occupants.map(String) : [];
  return {
    id: row.id,
    listingId: row.listing_id,
    homeId: row.home_id,
    address: home?.address1 || "",
    headline: listing?.headline || "",
    status: row.status,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    householdSize: row.household_size,
    occupants,
    currentAddress: row.current_address,
    landlordName: row.landlord_name,
    landlordPhone: row.landlord_phone,
    currentRentCents: row.current_rent_cents,
    reasonForMove: row.reason_for_move,
    employer: row.employer,
    jobTitle: row.job_title,
    monthlyIncomeCents: row.monthly_income_cents,
    employmentLength: row.employment_length,
    pets: row.pets,
    vehicles: row.vehicles,
    desiredMoveIn: row.desired_move_in,
    screeningConsent: Boolean(row.screening_consent),
    feeCents: row.fee_cents,
    feeStatus: row.fee_status,
    screeningStatus: row.screening_status,
    screeningProvider: row.screening_provider,
    screeningNotes: row.screening_notes,
    managerNotes: row.manager_notes,
    tenantId: row.tenant_id,
    leaseId: row.lease_id,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

const applicationSelect = "*, rental_listings(headline), homes(address1, city, state)";

function unpack(row: any) {
  const listing = Array.isArray(row.rental_listings) ? row.rental_listings[0] : row.rental_listings;
  const home = Array.isArray(row.homes) ? row.homes[0] : row.homes;
  return mapApplication(row, listing, home);
}

export async function listLiveApplications(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase.from("rental_applications").select(applicationSelect).eq("organization_id", organizationId).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(unpack);
}

export async function ensureLiveApplyToken(supabase: SupabaseClient, organizationId: string, listingId: string) {
  const { data, error } = await supabase.from("rental_listings").select("id, apply_token, application_fee_cents").eq("id", listingId).eq("organization_id", organizationId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  if (data.apply_token) return data.apply_token as string;
  const token = randomBytes(18).toString("hex");
  const { error: updateError } = await supabase.from("rental_listings").update({ apply_token: token }).eq("id", listingId);
  if (updateError) throw new Error(updateError.message);
  return token;
}

export async function publicLiveListing(admin: SupabaseClient, token: string): Promise<{ listing: PublicListing; listingId: string; organizationId: string; homeId: string } | null> {
  const { data } = await admin
    .from("rental_listings")
    .select("id, organization_id, home_id, headline, rent_cents, deposit_cents, available_on, bedrooms, bathrooms, pet_policy, lease_term, application_fee_cents, status, homes(address1, city, state)")
    .eq("apply_token", token)
    .maybeSingle();
  if (!data) return null;
  const home = Array.isArray(data.homes) ? data.homes[0] : data.homes;
  return {
    listingId: data.id,
    organizationId: data.organization_id,
    homeId: data.home_id,
    listing: {
      headline: data.headline,
      address: home?.address1 || "",
      city: [home?.city, home?.state].filter(Boolean).join(", "),
      rentCents: data.rent_cents,
      depositCents: data.deposit_cents,
      availableOn: data.available_on,
      bedrooms: Number(data.bedrooms ?? 0),
      bathrooms: Number(data.bathrooms ?? 0),
      petPolicy: data.pet_policy || "",
      leaseTerm: data.lease_term || "",
      feeCents: data.application_fee_cents ?? DEFAULT_APPLICATION_FEE_CENTS,
      status: data.status,
    },
  };
}

export async function insertLiveApplication(admin: SupabaseClient, input: {
  organizationId: string;
  listingId: string;
  homeId: string;
  feeCents: number;
  fields: Record<string, unknown>;
}) {
  const { data, error } = await admin.from("rental_applications").insert({
    organization_id: input.organizationId,
    listing_id: input.listingId,
    home_id: input.homeId,
    fee_cents: input.feeCents,
    fee_status: input.feeCents === 0 ? "waived" : "unpaid",
    ...input.fields,
  }).select(applicationSelect).single();
  if (error) throw new Error(error.message);
  return unpack(data);
}

export async function markLiveApplicationFee(admin: SupabaseClient, id: string, status: ApplicationFeeStatus, intentId?: string | null) {
  const patch: Record<string, unknown> = { fee_status: status, updated_at: new Date().toISOString() };
  if (intentId) patch.stripe_payment_intent_id = intentId;
  const { data, error } = await admin.from("rental_applications").update(patch).eq("id", id).select(applicationSelect).single();
  if (error) throw new Error(error.message);
  return unpack(data);
}

export async function findLiveApplicationByIntent(admin: SupabaseClient, intentId: string) {
  const { data } = await admin.from("rental_applications").select("id, fee_status").eq("stripe_payment_intent_id", intentId).maybeSingle();
  return data as { id: string; fee_status: string } | null;
}

export async function updateLiveApplication(supabase: SupabaseClient, organizationId: string, id: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase.from("rental_applications").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("organization_id", organizationId).select(applicationSelect).single();
  if (error) throw new Error(error.message);
  return unpack(data);
}

export async function getLiveApplication(supabase: SupabaseClient, organizationId: string, id: string) {
  const { data, error } = await supabase.from("rental_applications").select(applicationSelect).eq("id", id).eq("organization_id", organizationId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? unpack(data) : null;
}

function addMonths(isoDate: string, months: number) {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

export async function leaseLiveApplication(supabase: SupabaseClient, organizationId: string, id: string) {
  const current = await getLiveApplication(supabase, organizationId, id);
  if (!current) return { error: "Application not found", status: 404 as const };
  if (current.status !== "approved" && current.status !== "leased") return { error: "Approve the application before creating a lease.", status: 409 as const };
  if (current.tenantId && current.leaseId) return { application: current, created: false as const };

  const { data: listing } = await supabase.from("rental_listings").select("rent_cents, deposit_cents, lease_term").eq("id", current.listingId).maybeSingle();
  const email = current.email.trim().toLowerCase();
  const { data: existing } = await supabase.from("tenants").select("id").eq("organization_id", organizationId).ilike("email", email).maybeSingle();
  let tenantId = existing?.id as string | undefined;
  if (!tenantId) {
    const { data: tenant, error } = await supabase.from("tenants").insert({
      organization_id: organizationId,
      full_name: current.fullName,
      email: current.email,
      phone: current.phone,
    }).select("id").single();
    if (error) throw new Error(error.message);
    tenantId = tenant.id;
  }
  const starts = (current.desiredMoveIn || new Date().toISOString()).slice(0, 10);
  const { data: lease, error: leaseError } = await supabase.from("leases").insert({
    organization_id: organizationId,
    home_id: current.homeId,
    tenant_id: tenantId,
    starts_on: starts,
    ends_on: addMonths(starts, 12),
    rent_cents: listing?.rent_cents ?? 0,
    deposit_cents: listing?.deposit_cents ?? 0,
    balance_cents: 0,
    status: "draft",
  }).select("id").single();
  if (leaseError) throw new Error(leaseError.message);
  const application = await updateLiveApplication(supabase, organizationId, id, {
    tenant_id: tenantId,
    lease_id: lease.id,
    status: "leased",
    decided_at: current.decidedAt || new Date().toISOString(),
  });
  return { application, created: true as const, tenantId: tenantId! };
}

export function screeningPatch(status: ScreeningStatus, notes: string | null, provider: string | null) {
  const patch: Record<string, unknown> = {
    screening_status: status,
    screening_notes: notes,
    screening_provider: provider,
  };
  if (status === "requested" || status === "review") patch.status = "screening" satisfies ApplicationStatus;
  return patch;
}
