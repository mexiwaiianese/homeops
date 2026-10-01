import { NextResponse } from "next/server";
import { isDemoOrganizationSlug } from "@/lib/demo-ledger";
import { requirePlatformAdmin } from "@/lib/operator-admin";
import { listMemoryWorkspaces } from "@/lib/provision-org";
import { getOrgSubscription, listPackages } from "@/lib/subscription-packages";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;
  const packages = await listPackages();
  const admin = createSupabaseAdminClient();
  if (!admin) {
    const rows = await Promise.all(listMemoryWorkspaces().map(async (row) => {
      const sub = await getOrgSubscription(row.organizationId);
      return {
        id: row.organizationId,
        name: row.name,
        slug: row.slug,
        createdAt: null,
        memberCount: 1,
        ownerEmail: row.ownerEmail,
        demo: false,
        packageId: sub.packageId,
        packageName: sub.package.name,
        status: sub.status,
        features: sub.features,
      };
    }));
    return NextResponse.json({ organizations: rows, packages });
  }

  const { data: orgs, error } = await admin.from("organizations").select("id, name, slug, created_at").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (orgs ?? []).map((row) => row.id);
  const [{ data: members }, { data: subs }] = await Promise.all([
    admin.from("organization_members").select("organization_id, user_id").in("organization_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    admin.from("organization_subscriptions").select("*").in("organization_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const memberCount = new Map<string, number>();
  for (const row of members ?? []) {
    memberCount.set(row.organization_id, (memberCount.get(row.organization_id) || 0) + 1);
  }
  const subByOrg = new Map((subs ?? []).map((row) => [row.organization_id, row]));
  const organizations = await Promise.all((orgs ?? []).map(async (org) => {
    const sub = await getOrgSubscription(org.id);
    const stored = subByOrg.get(org.id);
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      createdAt: org.created_at,
      memberCount: memberCount.get(org.id) || 0,
      demo: isDemoOrganizationSlug(org.slug),
      packageId: stored?.package_id || sub.packageId,
      packageName: sub.package.name,
      status: sub.status,
      features: sub.features,
    };
  }));
  return NextResponse.json({ organizations, packages });
}
