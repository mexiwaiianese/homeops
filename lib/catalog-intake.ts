import { normalizeVendorName, buildVendorFingerprint } from "@/lib/vendors";
import { getPlatformCatalog } from "@/lib/platform-catalog";
import { vendors as demoVendors } from "@/lib/vendor-demo";
import { demoProspects } from "@/lib/vendor-prospect-demo";

export type CatalogMatch = {
  id: string;
  kind: "vendor" | "prospect";
  name: string;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  workflow_stage?: string | null;
  outreach_status?: string | null;
  reasons: string[];
};

export type CatalogIntakeReview = {
  id: string;
  organization_id: string;
  organization_name?: string | null;
  org_vendor_id: string;
  name: string;
  trade?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  identity_fingerprint: string;
  matches: CatalogMatch[];
  status: "pending" | "merged" | "authorized" | "dismissed";
  catalog_vendor_id?: string | null;
  created_at: string;
  resolved_at?: string | null;
};

type MemoryStore = Map<string, CatalogIntakeReview>;
const memory: MemoryStore =
  ((globalThis as typeof globalThis & { __homeopsCatalogReviews?: MemoryStore }).__homeopsCatalogReviews ??= new Map());

export function duplicateReasons(
  candidate: { name: string; phone?: string | null; email?: string | null; fingerprint?: string },
  row: { name?: string | null; phone?: string | null; email?: string | null; identity_fingerprint?: string | null },
) {
  const reasons: string[] = [];
  const cName = normalizeVendorName(candidate.name);
  const rName = normalizeVendorName(row.name || "");
  if (cName && rName && cName === rName) reasons.push("Same name");
  const cPhone = (candidate.phone ?? "").replace(/\D/g, "").slice(-10);
  const rPhone = (row.phone ?? "").replace(/\D/g, "").slice(-10);
  if (cPhone.length === 10 && cPhone === rPhone) reasons.push("Same phone");
  const cEmail = (candidate.email ?? "").trim().toLowerCase();
  const rEmail = (row.email ?? "").trim().toLowerCase();
  if (cEmail && cEmail === rEmail) reasons.push("Same email");
  if (candidate.fingerprint && row.identity_fingerprint && candidate.fingerprint === row.identity_fingerprint) {
    reasons.push("Same identity fingerprint");
  }
  return reasons;
}

export async function findCatalogDuplicates(candidate: {
  name: string;
  phone?: string | null;
  email?: string | null;
  postalCode?: string | null;
}) {
  const fingerprint = buildVendorFingerprint(candidate);
  const probe = { ...candidate, fingerprint };
  const catalog = await getPlatformCatalog();
  if (!catalog.ok) {
    return [
      ...demoVendors.flatMap((row) => {
        const reasons = duplicateReasons(probe, row);
        return reasons.length ? [{ id: row.id, kind: "vendor" as const, name: row.name, phone: row.phone, email: row.email, city: row.city, state: row.state, workflow_stage: row.workflow_stage, reasons }] : [];
      }),
      ...demoProspects.flatMap((row) => {
        const reasons = duplicateReasons(probe, row);
        return reasons.length ? [{ id: row.sourcePlaceId, kind: "prospect" as const, name: row.name, phone: row.phone, email: row.email, city: row.city, state: row.state, outreach_status: "discovered", reasons }] : [];
      }),
    ];
  }
  const [{ data: vendors }, { data: prospects }] = await Promise.all([
    catalog.admin.from("vendors").select("id,name,phone,email,city,state,workflow_stage,identity_fingerprint").eq("organization_id", catalog.organizationId),
    catalog.admin.from("vendor_prospects").select("id,source_place_id,name,phone,email,city,state,outreach_status,identity_fingerprint").eq("organization_id", catalog.organizationId),
  ]);
  const matches: CatalogMatch[] = [];
  for (const row of vendors ?? []) {
    const reasons = duplicateReasons(probe, row);
    if (reasons.length) matches.push({ id: row.id, kind: "vendor", name: row.name, phone: row.phone, email: row.email, city: row.city, state: row.state, workflow_stage: row.workflow_stage, reasons });
  }
  for (const row of prospects ?? []) {
    const reasons = duplicateReasons(probe, row);
    if (reasons.length) {
      matches.push({
        id: row.id,
        kind: "prospect",
        name: row.name,
        phone: row.phone,
        email: row.email,
        city: row.city,
        state: row.state,
        outreach_status: row.outreach_status,
        reasons,
      });
    }
  }
  return matches;
}

export async function queueCatalogIntake(input: {
  organizationId: string;
  organizationName?: string | null;
  vendor: {
    id: string;
    name: string;
    trade?: string | null;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
    state?: string | null;
    identity_fingerprint: string;
  };
  matches: CatalogMatch[];
  userId?: string | null;
}) {
  const review: CatalogIntakeReview = {
    id: `rev-${Date.now().toString(36)}`,
    organization_id: input.organizationId,
    organization_name: input.organizationName || null,
    org_vendor_id: input.vendor.id,
    name: input.vendor.name,
    trade: input.vendor.trade,
    email: input.vendor.email,
    phone: input.vendor.phone,
    city: input.vendor.city,
    state: input.vendor.state,
    identity_fingerprint: input.vendor.identity_fingerprint,
    matches: input.matches,
    status: "pending",
    created_at: new Date().toISOString(),
  };
  const catalog = await getPlatformCatalog();
  if (catalog.ok) {
    const { data, error } = await catalog.admin.from("catalog_intake_reviews").insert({
      organization_id: input.organizationId,
      org_vendor_id: input.vendor.id,
      identity_fingerprint: input.vendor.identity_fingerprint,
      proposed: {
        name: input.vendor.name,
        trade: input.vendor.trade,
        email: input.vendor.email,
        phone: input.vendor.phone,
        city: input.vendor.city,
        state: input.vendor.state,
        organization_name: input.organizationName,
      },
      matches: input.matches,
      status: "pending",
      created_by: input.userId || null,
    }).select("id,created_at").single();
    if (!error && data) {
      return { ...review, id: data.id, created_at: data.created_at };
    }
  }
  memory.set(review.id, review);
  return review;
}

export async function listCatalogIntakeReviews() {
  const catalog = await getPlatformCatalog();
  if (catalog.ok) {
    const { data, error } = await catalog.admin
      .from("catalog_intake_reviews")
      .select("*, organizations(name)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error && data) {
      return data.map((row) => ({
        id: row.id,
        organization_id: row.organization_id,
        organization_name: Array.isArray(row.organizations) ? row.organizations[0]?.name : row.organizations?.name,
        org_vendor_id: row.org_vendor_id,
        name: row.proposed?.name || "Candidate",
        trade: row.proposed?.trade,
        email: row.proposed?.email,
        phone: row.proposed?.phone,
        city: row.proposed?.city,
        state: row.proposed?.state,
        identity_fingerprint: row.identity_fingerprint,
        matches: row.matches || [],
        status: row.status,
        catalog_vendor_id: row.catalog_vendor_id,
        created_at: row.created_at,
        resolved_at: row.resolved_at,
      })) as CatalogIntakeReview[];
    }
  }
  return [...memory.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function resolveCatalogIntake(
  id: string,
  patch: Partial<Pick<CatalogIntakeReview, "status" | "catalog_vendor_id" | "resolved_at">>,
) {
  const catalog = await getPlatformCatalog();
  if (catalog.ok) {
    const { error } = await catalog.admin.from("catalog_intake_reviews").update({
      status: patch.status,
      catalog_vendor_id: patch.catalog_vendor_id ?? null,
      resolved_at: patch.resolved_at || new Date().toISOString(),
    }).eq("id", id);
    if (!error) return;
  }
  const current = memory.get(id);
  if (current) memory.set(id, { ...current, ...patch, resolved_at: patch.resolved_at || new Date().toISOString() });
}

export async function getCatalogIntakeReview(id: string) {
  const rows = await listCatalogIntakeReviews();
  return rows.find((row) => row.id === id) || null;
}
