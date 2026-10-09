import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/operator-admin";
import { FEATURE_CATALOG, parseOverrides } from "@/lib/product-features";
import { memoryWorkspaceById } from "@/lib/provision-org";
import { getOrgSubscription, listPackages, saveOrgSubscription } from "@/lib/subscription-packages";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { repairSelfSignupOrganizations } from "@/lib/vendor-billing-live";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const admin = createSupabaseAdminClient();
  if (admin) {
    const repaired = await repairSelfSignupOrganizations(admin);
    if ("error" in repaired) return NextResponse.json({ error: repaired.error }, { status: 500 });
  }
  let org: { id: string; name: string; slug: string } | null = null;
  if (admin) {
    const { data } = await admin.from("organizations").select("id, name, slug").eq("id", id).maybeSingle();
    org = data;
  } else {
    const memory = memoryWorkspaceById(id);
    if (memory) org = { id: memory.organizationId, name: memory.name, slug: memory.slug };
  }
  if (!org) return NextResponse.json({ error: "Organization not found." }, { status: 404 });
  const [sub, packages] = await Promise.all([getOrgSubscription(org.id), listPackages()]);
  return NextResponse.json({
    organization: org,
    subscription: sub,
    packages,
    catalog: FEATURE_CATALOG,
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const saved = await saveOrgSubscription({
    organizationId: id,
    packageId: String(body.packageId || ""),
    overrides: parseOverrides(body.overrides),
    status: typeof body.status === "string" ? body.status : "active",
  });
  return NextResponse.json({ ok: true, subscription: saved });
}
