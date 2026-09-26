// Per-tester demo sandboxes for live (Supabase) mode.
//
// Every beta tester who unlocks /dev/personas gets their own organization, seeded with the full
// demo data set (lib/demo-seed-live). All four portals read by organization id, so two testers
// never see each other's edits. The browser remembers which sandbox it owns through a signed,
// httpOnly cookie; the database is the cache that holds the sandbox contents.
//
// Lifecycle
//   unlock (correct access code)  -> previous sandbox deleted, fresh one created and seeded
//   list / sign-in / seed         -> current sandbox reused; created on demand if missing
//   seed { reset: true }          -> same as unlock without re-entering the code
//   forget code                   -> sandbox deleted, cookie cleared
//   housekeeping                  -> sandboxes older than the unlock window are deleted, since
//                                    no browser can still hold a valid cookie for them
//
// Security: the cookie is `<organizationId>.<hmac>` signed with the persona-login secret, and the
// organization must carry the sandbox slug prefix. A tampered cookie therefore cannot point the
// switcher at a real customer organization.

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEMO_WORKSPACE_SLUG_PREFIX, isDemoOrganizationSlug } from "@/lib/demo-ledger";
import { DEMO_ORG_NAME, seedDemoWorkspace, type SeedReport } from "@/lib/demo-seed-live";
import { baseCookieOptions, getPersonaLoginConfig, type CookieToSet } from "@/lib/persona-login";

export const demoWorkspaceCookie = "persona_login_workspace";
const PERSONA_EMAIL_SUFFIX = "@persona.example.com";

export type DemoWorkspace = {
  organizationId: string;
  slug: string;
  name: string;
  createdAt: string;
};

function sign(value: string) {
  return createHmac("sha256", getPersonaLoginConfig().cookieSecret).update(`workspace:${value}`).digest("hex");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function cookieMaxAge() {
  return getPersonaLoginConfig().unlockDays * 24 * 60 * 60;
}

export function workspaceCookie(organizationId: string): CookieToSet {
  return { name: demoWorkspaceCookie, value: `${organizationId}.${sign(organizationId)}`, options: baseCookieOptions(cookieMaxAge()) };
}

export function clearWorkspaceCookie(): CookieToSet {
  return { name: demoWorkspaceCookie, value: "", options: baseCookieOptions(0) };
}

/** Organization id from a valid cookie, or null. Does not hit the database. */
export async function workspaceIdFromCookie(): Promise<string | null> {
  const raw = (await cookies()).get(demoWorkspaceCookie)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const organizationId = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return null;
  return safeEqual(signature, sign(organizationId)) ? organizationId : null;
}

/** Write the sandbox pointer from inside a route handler (next/headers cookies are mutable there). */
async function rememberWorkspace(organizationId: string) {
  const cookie = workspaceCookie(organizationId);
  try {
    (await cookies()).set(cookie.name, cookie.value, cookie.options);
  } catch {
    // Server components cannot write cookies; the caller may also return the cookie explicitly.
  }
}

/** The caller's sandbox if the cookie is valid and the organization still exists. */
export async function resolveWorkspace(admin: SupabaseClient): Promise<DemoWorkspace | null> {
  const organizationId = await workspaceIdFromCookie();
  if (!organizationId) return null;
  const { data } = await admin.from("organizations").select("id, slug, name, created_at").eq("id", organizationId).maybeSingle();
  if (!data || !isDemoOrganizationSlug(data.slug)) return null;
  return { organizationId: data.id, slug: data.slug, name: data.name, createdAt: data.created_at };
}

/** Create an empty sandbox organization and fill it with the demo data set. */
export async function createWorkspace(admin: SupabaseClient): Promise<{ workspace: DemoWorkspace; report: SeedReport }> {
  const slug = `${DEMO_WORKSPACE_SLUG_PREFIX}${randomBytes(6).toString("hex")}`;
  const { data, error } = await admin
    .from("organizations")
    .insert({ name: DEMO_ORG_NAME, slug })
    .select("id, slug, name, created_at")
    .single();
  if (error || !data) throw new Error(`organizations: ${error?.message || "could not create the sandbox organization"}`);
  const workspace: DemoWorkspace = { organizationId: data.id, slug: data.slug, name: data.name, createdAt: data.created_at };
  const report = await seedDemoWorkspace(admin, workspace.organizationId);
  return { workspace, report };
}

async function personaAuthUserIds(admin: SupabaseClient, organizationId: string) {
  const [members, owners, vendors] = await Promise.all([
    admin.from("organization_members").select("user_id").eq("organization_id", organizationId),
    admin.from("owner_users").select("auth_user_id").eq("organization_id", organizationId),
    admin.from("vendor_users").select("auth_user_id").eq("organization_id", organizationId),
  ]);
  const ids = new Set<string>();
  for (const row of members.data ?? []) if (row.user_id) ids.add(row.user_id as string);
  for (const row of owners.data ?? []) if (row.auth_user_id) ids.add(row.auth_user_id as string);
  for (const row of vendors.data ?? []) if (row.auth_user_id) ids.add(row.auth_user_id as string);
  return [...ids];
}

/**
 * Delete a sandbox organization. Foreign keys cascade from organizations, so one delete removes
 * homes, leases, requests, charges, ledger rows, sessions, and so on. Synthetic persona logins
 * created for it are removed from Supabase Auth as well; real accounts are never touched.
 */
export async function deleteWorkspace(admin: SupabaseClient, organizationId: string) {
  const { data: org } = await admin.from("organizations").select("slug").eq("id", organizationId).maybeSingle();
  // Only per-tester sandboxes are disposable. The shared legacy demo org is left alone.
  if (!org || !String(org.slug).startsWith(DEMO_WORKSPACE_SLUG_PREFIX)) return false;
  const authUsers = await personaAuthUserIds(admin, organizationId);
  const { error } = await admin.from("organizations").delete().eq("id", organizationId);
  if (error) throw new Error(`organizations: ${error.message}`);
  for (const userId of authUsers) {
    try {
      const { data } = await admin.auth.admin.getUserById(userId);
      if (data.user?.email?.toLowerCase().endsWith(PERSONA_EMAIL_SUFFIX)) await admin.auth.admin.deleteUser(userId);
    } catch {
      // Orphaned synthetic logins are harmless; the next reset will try again.
    }
  }
  return true;
}

/** Remove sandboxes nobody can reach any more (older than the unlock cookie lifetime). */
export async function pruneStaleWorkspaces(admin: SupabaseClient, keep?: string | null) {
  const cutoff = new Date(Date.now() - cookieMaxAge() * 1000).toISOString();
  const { data } = await admin
    .from("organizations")
    .select("id")
    .like("slug", `${DEMO_WORKSPACE_SLUG_PREFIX}%`)
    .lt("created_at", cutoff)
    .limit(25);
  let removed = 0;
  for (const row of data ?? []) {
    if (row.id === keep) continue;
    if (await deleteWorkspace(admin, row.id).catch(() => false)) removed += 1;
  }
  return removed;
}

export type EnsureWorkspaceResult = {
  workspace: DemoWorkspace;
  /** True when a sandbox was created during this call (fresh seed). */
  created: boolean;
  /** True when a previous sandbox was deleted first. */
  replaced: boolean;
  report: SeedReport | null;
  cookies: CookieToSet[];
};

/**
 * Return the caller's sandbox, creating one when the browser has none. With `reset`, the previous
 * sandbox is deleted first so the tester starts from the pristine demo data set.
 */
export async function ensureWorkspace(admin: SupabaseClient, options: { reset?: boolean } = {}): Promise<EnsureWorkspaceResult> {
  const existing = await resolveWorkspace(admin);
  if (existing && !options.reset) {
    return { workspace: existing, created: false, replaced: false, report: null, cookies: [workspaceCookie(existing.organizationId)] };
  }
  let replaced = false;
  if (existing && options.reset) replaced = await deleteWorkspace(admin, existing.organizationId);
  const { workspace, report } = await createWorkspace(admin);
  await rememberWorkspace(workspace.organizationId);
  // Housekeeping rides along with creation so abandoned sandboxes never pile up.
  await pruneStaleWorkspaces(admin, workspace.organizationId).catch(() => 0);
  return { workspace, created: true, replaced, report, cookies: [workspaceCookie(workspace.organizationId)] };
}

/** Delete the caller's sandbox (if any) and return the cookie that forgets it. */
export async function dropWorkspace(admin: SupabaseClient): Promise<CookieToSet[]> {
  const existing = await resolveWorkspace(admin);
  if (existing) await deleteWorkspace(admin, existing.organizationId).catch(() => false);
  return [clearWorkspaceCookie()];
}

export function describeWorkspace(workspace: DemoWorkspace) {
  const short = workspace.slug.startsWith(DEMO_WORKSPACE_SLUG_PREFIX) ? workspace.slug.slice(DEMO_WORKSPACE_SLUG_PREFIX.length) : workspace.slug;
  const ageMs = Date.now() - new Date(workspace.createdAt).getTime();
  const minutes = Math.max(0, Math.round(ageMs / 60000));
  const age = minutes < 2 ? "just now" : minutes < 60 ? `${minutes} min ago` : minutes < 60 * 48 ? `${Math.round(minutes / 60)} h ago` : `${Math.round(minutes / 1440)} days ago`;
  return `Sandbox ${short} · created ${age} · only this browser sees its data`;
}
