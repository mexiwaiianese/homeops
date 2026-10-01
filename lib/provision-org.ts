import type { SupabaseClient } from "@supabase/supabase-js";
import { packageById } from "@/lib/product-features";
import { listPackages, saveOrgSubscription } from "@/lib/subscription-packages";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type BlankWorkspace = {
  organizationId: string;
  slug: string;
  name: string;
  packageId: string;
  ownerEmail: string;
};

type MemoryWorkspace = BlankWorkspace & { userId: string | null; fullName: string };

const memoryWorkspaces: Map<string, MemoryWorkspace> =
  ((globalThis as typeof globalThis & { __homeopsBlankOrgs?: Map<string, MemoryWorkspace> }).__homeopsBlankOrgs ??= new Map());

export const blankWorkspaceCookie = "homeops_blank_org";

function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "org";
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

export function listMemoryWorkspaces() {
  return [...memoryWorkspaces.values()];
}

export function memoryWorkspaceById(id: string) {
  return memoryWorkspaces.get(id) || null;
}

export function memoryWorkspaceByEmail(email: string) {
  const needle = email.trim().toLowerCase();
  return [...memoryWorkspaces.values()].find((row) => row.ownerEmail === needle) || null;
}

export async function provisionBlankOrganization(input: {
  email: string;
  fullName: string;
  organizationName: string;
  packageId?: string;
  userId?: string | null;
  admin?: SupabaseClient | null;
}): Promise<BlankWorkspace> {
  const email = input.email.trim().toLowerCase();
  const name = input.organizationName.trim() || `${input.fullName.trim() || email}'s organization`;
  const db = input.admin || createSupabaseAdminClient();
  const packages = await listPackages(db);
  const pkg = packageById(input.packageId, packages);

  if (!db) {
    const existing = memoryWorkspaceByEmail(email);
    if (existing) return existing;
    const organizationId = crypto.randomUUID();
    const workspace: MemoryWorkspace = {
      organizationId,
      slug: slugify(name),
      name,
      packageId: pkg.id,
      ownerEmail: email,
      userId: input.userId || null,
      fullName: input.fullName.trim() || email,
    };
    memoryWorkspaces.set(organizationId, workspace);
    await saveOrgSubscription({ organizationId, packageId: pkg.id, status: "active" }, null);
    return workspace;
  }

  if (input.userId) {
    const { data: membership } = await db.from("organization_members").select("organization_id").eq("user_id", input.userId).limit(1).maybeSingle();
    if (membership?.organization_id) {
      const { data: org } = await db.from("organizations").select("id, slug, name").eq("id", membership.organization_id).maybeSingle();
      if (org) {
        await saveOrgSubscription({ organizationId: org.id, packageId: pkg.id, status: "active" }, db);
        return { organizationId: org.id, slug: org.slug, name: org.name, packageId: pkg.id, ownerEmail: email };
      }
    }
  }

  const { data: org, error } = await db.from("organizations").insert({ name, slug: slugify(name) }).select("id, slug, name").single();
  if (error || !org) throw new Error(error?.message || "Could not create the organization.");
  if (input.userId) {
    await db.from("organization_members").insert({ organization_id: org.id, user_id: input.userId, role: "owner" });
  }
  await saveOrgSubscription({ organizationId: org.id, packageId: pkg.id, status: "active" }, db);
  return { organizationId: org.id, slug: org.slug, name: org.name, packageId: pkg.id, ownerEmail: email };
}

export async function attachUserToOrganization(admin: SupabaseClient, organizationId: string, userId: string) {
  await admin.from("organization_members").upsert({
    organization_id: organizationId,
    user_id: userId,
    role: "owner",
  }, { onConflict: "organization_id,user_id" });
}
