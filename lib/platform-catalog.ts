import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { canReleaseToOrganizations } from "@/lib/vendors";

/** Platform-owned org that stores the pre-screened vendor catalog. Admins are not members. */
export const PLATFORM_CATALOG_ORG_ID = "a11c0000-0000-4000-8000-00000000c07a";
export const PLATFORM_CATALOG_SLUG = "portonos-vendor-catalog";
export const PLATFORM_CATALOG_NAME = "portonOS Vendor Catalog";

const VENDOR_DIRECTORY_SELECT =
  "*, vendor_contacts(*), vendor_services(*, service_categories(*)), vendor_service_areas(*), vendor_credentials(*), vendor_documents(*), vendor_pricing_items(*), vendor_owner_preferences(*), vendor_property_preferences(*), vendor_performance_events(*)";

/** Org review payload: no W-9s, tax files, or private notes. */
const ORG_CATALOG_SELECT =
  "id,name,trade,email,phone,website,address1,city,state,postal_code,workflow_stage,approval_status,emergency_available,expected_response_minutes,minimum_trip_charge_cents,hourly_rate_cents,catalog_released,catalog_released_at,vendor_services(*, service_categories(name)),vendor_credentials(name,verification_status,expires_on)";

export async function ensurePlatformCatalogOrg(admin: SupabaseClient) {
  const { data: byId } = await admin.from("organizations").select("id,name").eq("id", PLATFORM_CATALOG_ORG_ID).maybeSingle();
  if (byId) return byId;
  const { data: bySlug } = await admin.from("organizations").select("id,name").eq("slug", PLATFORM_CATALOG_SLUG).maybeSingle();
  if (bySlug) return bySlug;
  const { data: created, error } = await admin
    .from("organizations")
    .insert({ id: PLATFORM_CATALOG_ORG_ID, name: PLATFORM_CATALOG_NAME, slug: PLATFORM_CATALOG_SLUG })
    .select("id,name")
    .single();
  if (created) return created;
  const retry = await admin.from("organizations").select("id,name").eq("slug", PLATFORM_CATALOG_SLUG).maybeSingle();
  if (retry.data) return retry.data;
  throw new Error(error?.message || "Could not create the platform vendor catalog");
}

export async function getPlatformCatalog() {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false as const, error: "Catalog backend is not configured" };
  try {
    const org = await ensurePlatformCatalogOrg(admin);
    return { ok: true as const, admin, organizationId: org.id as string, organizationName: org.name as string };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not open the vendor catalog" };
  }
}

export function stripCatalogDocuments<T extends Record<string, unknown>>(row: T) {
  const { vendor_documents, private_notes, w9_status, tax_document_status, ...rest } = row;
  void vendor_documents;
  void private_notes;
  void w9_status;
  void tax_document_status;
  return rest;
}

export async function listCatalogVendors(admin: SupabaseClient, organizationId: string, opts?: { releasedOnly?: boolean; q?: string; status?: string | null; stage?: string | null }) {
  let query = admin.from("vendors").select(VENDOR_DIRECTORY_SELECT).eq("organization_id", organizationId).order("name");
  if (opts?.releasedOnly) query = query.eq("catalog_released", true);
  if (opts?.status) query = query.eq("approval_status", opts.status);
  if (opts?.stage) query = query.eq("workflow_stage", opts.stage);
  if (opts?.q) query = query.or(`name.ilike.%${opts.q}%,trade.ilike.%${opts.q}%,city.ilike.%${opts.q}%,state.ilike.%${opts.q}%`);
  return query;
}

export async function listReleasedCatalogForOrg(admin: SupabaseClient, catalogOrgId: string) {
  return admin.from("vendors").select(ORG_CATALOG_SELECT).eq("organization_id", catalogOrgId).eq("catalog_released", true).order("name");
}

export async function releaseCatalogVendor(admin: SupabaseClient, catalogOrgId: string, vendorId: string) {
  const { data: vendor, error } = await admin
    .from("vendors")
    .select("id,workflow_stage,catalog_released")
    .eq("id", vendorId)
    .eq("organization_id", catalogOrgId)
    .maybeSingle();
  if (error || !vendor) return { ok: false as const, error: "Vendor not found in the platform catalog" };
  if (!canReleaseToOrganizations(vendor.workflow_stage)) {
    return { ok: false as const, error: "Qualify the vendor through documents reviewed before releasing to organizations." };
  }
  const { data, error: updateError } = await admin
    .from("vendors")
    .update({ catalog_released: true, catalog_released_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", vendorId)
    .eq("organization_id", catalogOrgId)
    .select()
    .single();
  if (updateError || !data) return { ok: false as const, error: updateError?.message || "Could not release this vendor" };
  return { ok: true as const, vendor: data };
}

export async function adoptCatalogVendor(input: {
  admin: SupabaseClient;
  catalogOrgId: string;
  organizationId: string;
  catalogVendorId: string;
  userId?: string | null;
}) {
  const { data: catalog, error } = await input.admin
    .from("vendors")
    .select("*")
    .eq("id", input.catalogVendorId)
    .eq("organization_id", input.catalogOrgId)
    .maybeSingle();
  if (error || !catalog) return { ok: false as const, error: "Catalog vendor not found" };
  if (!catalog.catalog_released) return { ok: false as const, error: "This vendor has not been released to organizations" };

  const { data: existing } = await input.admin
    .from("vendors")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("catalog_vendor_id", input.catalogVendorId)
    .maybeSingle();
  if (existing) {
    await upsertAdoption(input.admin, input.organizationId, input.catalogVendorId, existing.id, "approved", input.userId);
    return { ok: true as const, vendorId: existing.id as string, alreadyAdopted: true };
  }

  const now = new Date().toISOString();
  const { data: copy, error: insertError } = await input.admin
    .from("vendors")
    .insert({
      organization_id: input.organizationId,
      catalog_vendor_id: catalog.id,
      name: catalog.name,
      legal_name: catalog.legal_name,
      dba_name: catalog.dba_name,
      normalized_name: catalog.normalized_name,
      identity_fingerprint: catalog.identity_fingerprint,
      trade: catalog.trade,
      email: catalog.email,
      phone: catalog.phone,
      website: catalog.website,
      address1: catalog.address1,
      address2: catalog.address2,
      city: catalog.city,
      state: catalog.state,
      postal_code: catalog.postal_code,
      property_types: catalog.property_types,
      emergency_available: catalog.emergency_available,
      after_hours_available: catalog.after_hours_available,
      expected_response_minutes: catalog.expected_response_minutes,
      minimum_trip_charge_cents: catalog.minimum_trip_charge_cents,
      hourly_rate_cents: catalog.hourly_rate_cents,
      diagnostic_fee_cents: catalog.diagnostic_fee_cents,
      standard_hours: catalog.standard_hours,
      workflow_stage: "approved",
      approval_status: "approved",
      catalog_released: false,
      approved_at: now,
      private_notes: "Adopted from the portonOS pre-screened catalog. Tax documents stay with platform admin.",
    })
    .select("id")
    .single();
  if (insertError || !copy) return { ok: false as const, error: insertError?.message || "Could not add this vendor to the organization" };

  const { data: services } = await input.admin
    .from("vendor_services")
    .select("service_category_id, specialty, active, emergency_supported")
    .eq("vendor_id", catalog.id);
  if (services?.length) {
    await input.admin.from("vendor_services").insert(
      services.map((service) => ({
        organization_id: input.organizationId,
        vendor_id: copy.id,
        service_category_id: service.service_category_id,
        specialty: service.specialty,
        active: service.active,
        emergency_supported: service.emergency_supported,
      })),
    );
  }

  const { data: credentials } = await input.admin
    .from("vendor_credentials")
    .select("credential_type,name,issuing_authority,jurisdiction,issued_on,expires_on,verification_status")
    .eq("vendor_id", catalog.id);
  if (credentials?.length) {
    await input.admin.from("vendor_credentials").insert(
      credentials.map((credential) => ({
        organization_id: input.organizationId,
        vendor_id: copy.id,
        credential_type: credential.credential_type,
        name: credential.name,
        issuing_authority: credential.issuing_authority,
        jurisdiction: credential.jurisdiction,
        issued_on: credential.issued_on,
        expires_on: credential.expires_on,
        verification_status: credential.verification_status,
      })),
    );
  }

  await upsertAdoption(input.admin, input.organizationId, input.catalogVendorId, copy.id, "approved", input.userId);
  await input.admin.from("vendor_status_history").insert({
    organization_id: input.organizationId,
    vendor_id: copy.id,
    from_workflow_stage: catalog.workflow_stage,
    to_workflow_stage: "approved",
    from_approval_status: catalog.approval_status,
    to_approval_status: "approved",
    reason: "Owner approved a pre-screened catalog vendor",
    changed_by: input.userId || null,
    metadata: { source: "catalog_adopt", catalog_vendor_id: catalog.id },
  });
  return { ok: true as const, vendorId: copy.id as string, alreadyAdopted: false };
}

async function upsertAdoption(
  admin: SupabaseClient,
  organizationId: string,
  catalogVendorId: string,
  vendorId: string,
  reviewStatus: "pending" | "approved" | "rejected",
  userId?: string | null,
) {
  const now = new Date().toISOString();
  await admin.from("organization_vendor_adoptions").upsert(
    {
      organization_id: organizationId,
      catalog_vendor_id: catalogVendorId,
      vendor_id: vendorId,
      review_status: reviewStatus,
      updated_at: now,
      reviewed_at: now,
      reviewed_by: userId || null,
    },
    { onConflict: "organization_id,catalog_vendor_id" },
  );
}
