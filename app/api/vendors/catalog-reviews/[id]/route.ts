import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/operator-admin";
import { getCatalogIntakeReview, resolveCatalogIntake } from "@/lib/catalog-intake";
import { getPlatformCatalog } from "@/lib/platform-catalog";
import { normalizeVendorName } from "@/lib/vendors";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action === "merge" ? "merge" : body.action === "authorize" ? "authorize" : null;
  if (!action) return NextResponse.json({ error: "Choose merge or authorize." }, { status: 400 });

  const review = await getCatalogIntakeReview(id);
  if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });
  if (review.status !== "pending") return NextResponse.json({ error: "This candidate has already been resolved." }, { status: 409 });

  const catalog = await getPlatformCatalog();
  if (!catalog.ok) {
    await resolveCatalogIntake(id, {
      status: action === "merge" ? "merged" : "authorized",
      catalog_vendor_id: body.catalogVendorId || review.matches.find((row) => row.kind === "vendor")?.id || null,
    });
    return NextResponse.json({ ok: true, mode: "demo", action });
  }

  if (action === "merge") {
    const catalogVendorId = String(body.catalogVendorId || review.matches.find((row) => row.kind === "vendor")?.id || "");
    if (!catalogVendorId) return NextResponse.json({ error: "Pick the catalog vendor to merge into." }, { status: 400 });
    const { data: catalogVendor } = await catalog.admin.from("vendors").select("id").eq("id", catalogVendorId).eq("organization_id", catalog.organizationId).maybeSingle();
    if (!catalogVendor) return NextResponse.json({ error: "Catalog vendor not found" }, { status: 404 });
    await catalog.admin.from("vendors").update({
      catalog_vendor_id: catalogVendorId,
      updated_at: new Date().toISOString(),
      private_notes: "Merged with an existing portonOS catalog vendor. Screening stays on the catalog record.",
    }).eq("id", review.org_vendor_id);
    await resolveCatalogIntake(id, { status: "merged", catalog_vendor_id: catalogVendorId });
    return NextResponse.json({ ok: true, action: "merge", catalogVendorId });
  }

  const now = new Date().toISOString();
  const { data: created, error } = await catalog.admin.from("vendors").insert({
    organization_id: catalog.organizationId,
    name: review.name,
    normalized_name: normalizeVendorName(review.name),
    identity_fingerprint: review.identity_fingerprint,
    trade: review.trade || null,
    email: review.email || null,
    phone: review.phone || null,
    city: review.city || null,
    state: review.state || null,
    workflow_stage: "candidate",
    approval_status: "conditional",
    catalog_released: false,
    private_notes: `Authorized from ${review.organization_name || "an organization"} candidate. Invite and screen in the platform catalog.`,
  }).select("id").single();
  if (error || !created) return NextResponse.json({ error: error?.message || "Could not create the catalog vendor" }, { status: 400 });

  await catalog.admin.from("vendor_prospects").upsert({
    organization_id: catalog.organizationId,
    vendor_id: created.id,
    source: "manual",
    source_place_id: `org-${review.org_vendor_id}`,
    name: review.name,
    normalized_name: normalizeVendorName(review.name),
    identity_fingerprint: review.identity_fingerprint,
    category_slug: "general-maintenance",
    category_name: review.trade || "General Maintenance",
    phone: review.phone,
    email: review.email,
    city: review.city,
    state: review.state,
    outreach_status: "discovered",
    last_discovered_at: now,
    updated_at: now,
  }, { onConflict: "organization_id,source,source_place_id" });

  await catalog.admin.from("vendors").update({
    catalog_vendor_id: created.id,
    updated_at: now,
  }).eq("id", review.org_vendor_id);

  await resolveCatalogIntake(id, { status: "authorized", catalog_vendor_id: created.id });
  return NextResponse.json({ ok: true, action: "authorize", catalogVendorId: created.id });
}
