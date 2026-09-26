// HomeOps adapter for the reusable persona login (lib/persona-login).
//
// Demo mode (no Supabase env): personas are the seeded manager, owners, tenants, and vendors and
// sign-in sets the same cookies the real demo pickers set.
//
// Live mode (Supabase configured): every tester gets a private sandbox organization seeded with the
// full demo data set (lib/demo-workspace, lib/demo-seed-live). Personas are discovered from that
// sandbox only — one manager persona plus every owner, tenant, and vendor row. Entering the beta
// access code again throws the sandbox away and seeds a fresh one; reloading pages never re-seeds.
// Sign-in never touches a real person's login. Each persona gets its own synthetic identity
// (<group>-<id>@persona.example.com) that is created on first use and linked with
// organization_members / owner_users / vendor_users, so the persona sees exactly what that owner,
// vendor, or manager would see. Tenant personas get a row in tenant_sessions exactly like a consumed
// sign-in link would. Set PERSONA_LOGIN_LIVE_DISCOVERY=false to turn discovery (and sandboxes) off
// and rely only on PERSONA_LOGIN_LIVE_PERSONAS.
//
// PERSONA_LOGIN_LIVE_PERSONAS (optional JSON) adds explicit accounts you control on top of discovery:
//   [
//     {"id":"manager","group":"manager","label":"Pilot manager","email":"manager@pilot.example"},
//     {"id":"owner-jane","group":"owner","label":"Owner: Jane","email":"jane@pilot.example"},
//     {"id":"tenant-main","group":"tenant","label":"Tenant: 123 Main St","tenantId":"<tenants.id uuid>"},
//     {"id":"vendor-acme","group":"vendor","label":"Vendor: ACME Plumbing","email":"dispatch@acme.example"}
//   ]
// Email personas are signed in through Supabase Auth using an admin-generated magic-link token that is
// verified server-side, so the tester never needs the inbox.

import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthedContext } from "@/lib/backend";
import { homes, owners as demoOwners, tenants as demoTenants } from "@/lib/data";
import { resetDemoStores } from "@/lib/demo-reset";
import { seedDemoWorkspace, summarizeSeed } from "@/lib/demo-seed-live";
import { describeWorkspace, dropWorkspace, ensureWorkspace, resolveWorkspace, type DemoWorkspace } from "@/lib/demo-workspace";
import { demoOwnerSessionCookie } from "@/lib/owner-portal-access";
import type { CookieToSet, Persona, PersonaLoginAdapter, PersonaSignInResult } from "@/lib/persona-login";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantContext, revokeTenantSession, tenantSessionCookie, tenantSessionCookieOptions } from "@/lib/tenant-auth";
import { consumeDemoLoginToken, issueDemoLoginToken, SESSION_TTL_MS } from "@/lib/tenant-demo";
import { vendors as demoVendors } from "@/lib/vendor-demo";
import { demoVendorSessionCookie } from "@/lib/vendor-job-demo";

type Group = "manager" | "owner" | "tenant" | "vendor";

const GROUPS: Record<Group, { label: string; landingPath: string }> = {
  manager: { label: "Property manager", landingPath: "/" },
  owner: { label: "Owners", landingPath: "/owners" },
  tenant: { label: "Tenants", landingPath: "/tenant" },
  vendor: { label: "Vendors", landingPath: "/vendors/desk" },
};

const DEMO_COOKIE_MAX_AGE = 60 * 60 * 24 * 14;

function cookie(name: string, value: string, maxAge = DEMO_COOKIE_MAX_AGE): CookieToSet {
  return { name, value, options: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge } };
}

function clear(name: string): CookieToSet {
  return cookie(name, "", 0);
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

// ---------------------------------------------------------------------------------------------
// Demo personas

function demoPersonas(): Persona[] {
  const manager: Persona = {
    id: "manager",
    group: "manager",
    groupLabel: GROUPS.manager.label,
    label: "Demo manager",
    description: "Operations desk, maintenance, books, listings for the demo organization",
    landingPath: GROUPS.manager.landingPath,
    badge: "demo",
  };
  const owners = demoOwners.map<Persona>((owner) => ({
    id: `owner:${owner.id}`,
    group: "owner",
    groupLabel: GROUPS.owner.label,
    label: owner.name,
    description: `${owner.homes} ${owner.homes === 1 ? "property" : "properties"} · ${owner.email}`,
    landingPath: GROUPS.owner.landingPath,
    badge: "demo",
    meta: { ownerId: owner.id },
  }));
  const tenants = demoTenants.map<Persona>((tenant) => {
    const home = homes.find((row) => row.tenantId === tenant.id);
    return {
      id: `tenant:${tenant.id}`,
      group: "tenant",
      groupLabel: GROUPS.tenant.label,
      label: tenant.name,
      description: [home?.address, home?.city].filter(Boolean).join(", ") || tenant.email || undefined,
      landingPath: GROUPS.tenant.landingPath,
      badge: "demo",
      meta: { tenantId: tenant.id },
    };
  });
  const vendors = demoVendors.map<Persona>((vendor) => ({
    id: `vendor:${vendor.id}`,
    group: "vendor",
    groupLabel: GROUPS.vendor.label,
    label: vendor.name,
    description: `${vendor.trade} · ${vendor.city}, ${vendor.state} · ${vendor.approval_status}`,
    landingPath: GROUPS.vendor.landingPath,
    badge: "demo",
    meta: { vendorId: vendor.id },
  }));
  return [manager, ...owners, ...tenants, ...vendors];
}

function demoSignIn(persona: Persona): PersonaSignInResult {
  if (persona.group === "manager") return { ok: true };
  if (persona.group === "owner" && persona.meta?.ownerId) return { ok: true, cookies: [cookie(demoOwnerSessionCookie, persona.meta.ownerId)] };
  if (persona.group === "vendor" && persona.meta?.vendorId) return { ok: true, cookies: [cookie(demoVendorSessionCookie, persona.meta.vendorId)] };
  if (persona.group === "tenant" && persona.meta?.tenantId) {
    // Reuse the real link flow so the session lives in the same in-memory store the portal reads.
    const consumed = consumeDemoLoginToken(issueDemoLoginToken(persona.meta.tenantId));
    if (!("sessionId" in consumed)) return { ok: false, error: consumed.error };
    return { ok: true, cookies: [{ name: tenantSessionCookie, value: `demo.${consumed.sessionId}`, options: tenantSessionCookieOptions() }] };
  }
  return { ok: false, error: "This demo persona is missing its record id." };
}

// ---------------------------------------------------------------------------------------------
// Live personas: explicit env JSON (PERSONA_LOGIN_LIVE_PERSONAS)

type LivePersonaInput = { id?: string; group?: string; label?: string; description?: string; email?: string; tenantId?: string; landingPath?: string };

function envPersonas(): Persona[] {
  const raw = (process.env.PERSONA_LOGIN_LIVE_PERSONAS || "").trim();
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[persona-login] PERSONA_LOGIN_LIVE_PERSONAS is not valid JSON; no live personas available.");
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const personas: Persona[] = [];
  (parsed as LivePersonaInput[]).forEach((row, index) => {
    const group = row.group as Group;
    if (!GROUPS[group]) return;
    const email = row.email?.trim().toLowerCase();
    const tenantId = row.tenantId?.trim();
    if (group === "tenant" ? !tenantId : !email) return;
    const meta: Record<string, string> = {};
    if (email) meta.email = email;
    if (tenantId) meta.tenantId = tenantId;
    personas.push({
      id: row.id?.trim() || `${group}-${index + 1}`,
      group,
      groupLabel: GROUPS[group].label,
      label: row.label?.trim() || email || `${GROUPS[group].label} ${index + 1}`,
      description: row.description?.trim() || (group === "tenant" ? "Tenant portal session" : email),
      landingPath: row.landingPath?.trim() || GROUPS[group].landingPath,
      badge: "live",
      meta,
    });
  });
  return personas;
}

// ---------------------------------------------------------------------------------------------
// Live personas: discovered from the caller's sandbox organization

const DISCOVERY_CAP = 12;
const PERSONA_EMAIL_DOMAIN = "persona.example.com";

function discoveryEnabled() {
  return !["0", "false", "no", "off"].includes((process.env.PERSONA_LOGIN_LIVE_DISCOVERY || "").trim().toLowerCase());
}

/** Synthetic, undeliverable login identity for a discovered record. Deterministic so re-use links to the same auth user. */
function personaEmail(group: Group, recordId: string) {
  return `${group}-${recordId.replace(/-/g, "").slice(0, 12)}@${PERSONA_EMAIL_DOMAIN}`;
}

type HomeRow = { id: string; address1: string; city: string; state: string; owner_id?: string };

/**
 * The tester's sandbox, created and seeded on first contact so every portal has data the moment it
 * loads. Existing sandboxes are reused as-is: nothing is re-seeded or overwritten on later visits.
 */
async function currentWorkspace(admin: SupabaseClient): Promise<DemoWorkspace | null> {
  try {
    const result = await ensureWorkspace(admin);
    if (result.created) console.info("[persona-login] sandbox created", { slug: result.workspace.slug, summary: result.report ? summarizeSeed(result.report) : "" });
    return result.workspace;
  } catch (error) {
    console.warn("[persona-login] could not prepare a sandbox", error);
    return null;
  }
}

async function discoverPersonas(admin: SupabaseClient, workspace: DemoWorkspace): Promise<Persona[]> {
  const organizationId = workspace.organizationId;
  const [owners, tenants, vendors, homes, leases] = await Promise.all([
    admin.from("owners").select("id, organization_id, full_name, email").eq("organization_id", organizationId).order("created_at").limit(DISCOVERY_CAP),
    admin.from("tenants").select("id, organization_id, full_name, email").eq("organization_id", organizationId).order("created_at").limit(DISCOVERY_CAP),
    admin.from("vendors").select("id, organization_id, name, trade, city, state").eq("organization_id", organizationId).order("created_at").limit(DISCOVERY_CAP),
    admin.from("homes").select("id, owner_id, address1, city, state").eq("organization_id", organizationId).limit(200),
    admin.from("leases").select("tenant_id, home_id, status").eq("organization_id", organizationId).limit(400),
  ]);
  const orgs = { data: [{ id: organizationId, name: workspace.name }] };
  const orgName = new Map((orgs.data ?? []).map((row) => [row.id as string, row.name as string]));
  const homeRows = (homes.data ?? []) as HomeRow[];
  const homesByOwner = new Map<string, number>();
  for (const home of homeRows) if (home.owner_id) homesByOwner.set(home.owner_id, (homesByOwner.get(home.owner_id) ?? 0) + 1);
  const homeById = new Map(homeRows.map((row) => [row.id, row]));
  const homeForTenant = new Map<string, HomeRow>();
  for (const lease of (leases.data ?? []) as Array<{ tenant_id: string; home_id: string; status: string }>) {
    const home = homeById.get(lease.home_id);
    if (!home) continue;
    if (!homeForTenant.has(lease.tenant_id) || lease.status === "active") homeForTenant.set(lease.tenant_id, home);
  }

  const personas: Persona[] = [];
  for (const org of orgs.data ?? []) {
    personas.push({
      id: `manager:${org.id}`,
      group: "manager",
      groupLabel: GROUPS.manager.label,
      label: "Demo manager",
      description: `Operations desk, rent collection, books, vendor network, listings for ${org.name}`,
      landingPath: GROUPS.manager.landingPath,
      badge: "live",
      meta: { organizationId: org.id, email: personaEmail("manager", org.id) },
    });
  }
  for (const owner of owners.data ?? []) {
    const count = homesByOwner.get(owner.id) ?? 0;
    personas.push({
      id: `owner:${owner.id}`,
      group: "owner",
      groupLabel: GROUPS.owner.label,
      label: owner.full_name,
      description: [`${count} ${count === 1 ? "property" : "properties"}`, orgName.get(owner.organization_id)].filter(Boolean).join(" · "),
      landingPath: GROUPS.owner.landingPath,
      badge: "live",
      meta: { ownerId: owner.id, organizationId: owner.organization_id, email: personaEmail("owner", owner.id) },
    });
  }
  for (const tenant of tenants.data ?? []) {
    const home = homeForTenant.get(tenant.id);
    personas.push({
      id: `tenant:${tenant.id}`,
      group: "tenant",
      groupLabel: GROUPS.tenant.label,
      label: tenant.full_name,
      description: home ? `${home.address1}, ${home.city}, ${home.state}` : orgName.get(tenant.organization_id) || "Tenant portal",
      landingPath: GROUPS.tenant.landingPath,
      badge: "live",
      meta: { tenantId: tenant.id },
    });
  }
  for (const vendor of vendors.data ?? []) {
    personas.push({
      id: `vendor:${vendor.id}`,
      group: "vendor",
      groupLabel: GROUPS.vendor.label,
      label: vendor.name,
      description: [vendor.trade, [vendor.city, vendor.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "Vendor desk",
      landingPath: GROUPS.vendor.landingPath,
      badge: "live",
      meta: { vendorId: vendor.id, organizationId: vendor.organization_id, email: personaEmail("vendor", vendor.id) },
    });
  }
  return personas;
}

async function livePersonas(): Promise<Persona[]> {
  const explicit = envPersonas();
  if (!discoveryEnabled()) return explicit;
  const admin = createSupabaseAdminClient();
  if (!admin) return explicit;
  try {
    const workspace = await currentWorkspace(admin);
    if (!workspace) return explicit;
    const discovered = await discoverPersonas(admin, workspace);
    const seen = new Set(explicit.map((row) => row.id));
    return [...explicit, ...discovered.filter((row) => !seen.has(row.id))];
  } catch (error) {
    console.warn("[persona-login] live discovery failed", error);
    return explicit;
  }
}

/** Sign the SSR client in as `email` through an admin-generated magic link. Returns the auth user id. */
async function signInSupabaseUser(admin: SupabaseClient, email: string) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase is not configured." };
  const existing = await supabase.auth.getUser();
  if (existing.data.user?.email?.toLowerCase() === email.toLowerCase()) return { userId: existing.data.user.id };
  // Local only: a global sign-out revokes the one-time token this request is about to verify.
  if (existing.data.user) await supabase.auth.signOut({ scope: "local" });

  // generateLink creates the auth user when it does not exist yet, so a fresh identity works the first time.
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return { error: error?.message || "Supabase did not return a sign-in token." };
  const preferred = data.properties?.verification_type === "magiclink" ? "magiclink" : "email";
  const types = preferred === "magiclink" ? (["magiclink", "email"] as const) : (["email", "magiclink"] as const);
  let lastError = "Sign-in did not return a user.";
  for (const type of types) {
    const verify = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (verify.data.user) return { userId: verify.data.user.id };
    lastError = verify.error?.message || lastError;
    if (!/invalid or has expired/i.test(lastError)) break;
  }
  return { error: lastError };
}

async function liveSignIn(persona: Persona): Promise<PersonaSignInResult> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Persona login in live mode needs SUPABASE_SERVICE_ROLE_KEY on the server.", status: 503 };
  const meta = persona.meta ?? {};

  if (persona.group === "tenant") {
    if (!meta.tenantId) return { ok: false, error: "Tenant persona is missing tenantId." };
    const { data: row } = await admin.from("tenants").select("id, organization_id").eq("id", meta.tenantId).maybeSingle();
    if (!row) return { ok: false, error: "Tenant record not found for this persona.", status: 404 };
    const sessionToken = randomBytes(32).toString("hex");
    const { error } = await admin.from("tenant_sessions").insert({
      organization_id: row.organization_id,
      tenant_id: row.id,
      session_hash: sha256(sessionToken),
      user_agent: "persona-login",
      expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    });
    if (error) return { ok: false, error: schemaHint(error.message), status: 500 };
    return { ok: true, cookies: [{ name: tenantSessionCookie, value: `live.${sessionToken}`, options: tenantSessionCookieOptions() }] };
  }

  if (!meta.email) return { ok: false, error: "Persona is missing an email." };
  const signedIn = await signInSupabaseUser(admin, meta.email);
  if (!("userId" in signedIn)) return { ok: false, error: signedIn.error, status: 502 };

  // Discovered personas carry a record id; make sure the synthetic identity is linked to it so the
  // portals resolve the persona the same way they resolve a real login. Explicit env personas
  // (email only) keep the normal first-sign-in linkage rules.
  const stamp = { full_name: "Persona login", auth_user_id: signedIn.userId };
  let link: { error: { message: string } | null } = { error: null };
  if (persona.group === "manager" && meta.organizationId) {
    // "admin" so the sandbox manager can also run network-admin actions (add vendors, invite prospects).
    link = await admin.from("organization_members").upsert({ organization_id: meta.organizationId, user_id: signedIn.userId, role: "admin" }, { onConflict: "organization_id,user_id" });
  } else if (persona.group === "owner" && meta.ownerId && meta.organizationId) {
    link = await admin.from("owner_users").upsert({ organization_id: meta.organizationId, owner_id: meta.ownerId, email: meta.email, role: "owner", ...stamp }, { onConflict: "owner_id,email" });
  } else if (persona.group === "vendor" && meta.vendorId && meta.organizationId) {
    link = await admin.from("vendor_users").upsert({ organization_id: meta.organizationId, vendor_id: meta.vendorId, email: meta.email, role: "dispatcher", ...stamp }, { onConflict: "vendor_id,email" });
  }
  if (link.error) return { ok: false, error: schemaHint(`Signed in, but could not link the persona: ${link.error.message}`), status: 500 };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------

export const homeopsPersonaLogin: PersonaLoginAdapter = {
  async listPersonas() {
    return isSupabaseConfigured() ? livePersonas() : demoPersonas();
  },

  async signIn(persona) {
    // Drop the previous persona's demo/tenant cookies without revoking the Supabase session.
    // live sign-in replaces that session itself; a global sign-out here invalidates its token.
    const tenant = await getTenantContext().catch(() => null);
    if (tenant) await revokeTenantSession(tenant).catch(() => undefined);
    const clears = [clear(demoOwnerSessionCookie), clear(demoVendorSessionCookie), clear(tenantSessionCookie)];
    const result = isSupabaseConfigured() ? await liveSignIn(persona) : demoSignIn(persona);
    if (!result.ok) return result;
    return { ...result, cookies: [...clears, ...(result.cookies ?? [])] };
  },

  async signOut() {
    const tenant = await getTenantContext().catch(() => null);
    if (tenant) await revokeTenantSession(tenant).catch(() => undefined);
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
      if (data.user) await supabase?.auth.signOut().catch(() => undefined);
    }
    return [clear(demoOwnerSessionCookie), clear(demoVendorSessionCookie), clear(tenantSessionCookie)];
  },

  async currentUserEmail() {
    const { user } = await getAuthedContext();
    return user?.email ?? null;
  },

  // "Create demo data" fills gaps in the caller's sandbox without touching existing rows.
  // "Reset demo data" (reset: true) throws the sandbox away and seeds a pristine one.
  async seed({ reset }) {
    if (!isSupabaseConfigured()) {
      if (reset) return { ok: true, summary: resetDemoStores() };
      return { ok: true, summary: "Demo mode already has its seed data in memory. Use “Reset demo data” to start over." };
    }
    const admin = createSupabaseAdminClient();
    if (!admin) return { ok: false, error: "Seeding needs SUPABASE_SERVICE_ROLE_KEY on the server.", status: 503 };
    try {
      if (reset) {
        const result = await ensureWorkspace(admin, { reset: true });
        const summary = result.report ? summarizeSeed(result.report, result.workspace.name) : "Sandbox ready.";
        const clears = [clear(demoOwnerSessionCookie), clear(demoVendorSessionCookie), clear(tenantSessionCookie)];
        return { ok: true, summary: `${result.replaced ? "Previous sandbox deleted. " : ""}Fresh sandbox seeded. ${summary}`, cookies: [...clears, ...result.cookies] };
      }
      const result = await ensureWorkspace(admin);
      if (result.created) {
        return { ok: true, summary: `New sandbox seeded. ${result.report ? summarizeSeed(result.report, result.workspace.name) : ""}`.trim(), cookies: result.cookies };
      }
      const report = await seedDemoWorkspace(admin, result.workspace.organizationId);
      return { ok: true, summary: summarizeSeed(report, result.workspace.name), cookies: result.cookies };
    } catch (error) {
      return { ok: false, error: schemaHint(error instanceof Error ? error.message : "Could not seed demo data.") };
    }
  },

  // A fresh access-code submission is the tester's "start over" signal: zero out their sandbox and
  // seed it again so every portal (manager, owner, tenant, vendor) opens on the same clean data set.
  async onUnlock() {
    // Any persona session on this browser points at the data set being discarded.
    const clears = [clear(demoOwnerSessionCookie), clear(demoVendorSessionCookie), clear(tenantSessionCookie)];
    if (!isSupabaseConfigured()) return { cookies: clears, summary: resetDemoStores() };
    const admin = createSupabaseAdminClient();
    if (!admin) return { summary: "Unlocked. Sandboxes need SUPABASE_SERVICE_ROLE_KEY on the server; personas will come from PERSONA_LOGIN_LIVE_PERSONAS only." };
    if (!discoveryEnabled()) return { summary: "Unlocked. Live discovery is off, so no sandbox was created." };
    try {
      const result = await ensureWorkspace(admin, { reset: true });
      const summary = result.report ? summarizeSeed(result.report, result.workspace.name) : "";
      return {
        cookies: [...clears, ...result.cookies],
        summary: `${result.replaced ? "Your previous demo data was cleared. " : ""}Fresh demo sandbox ready for every portal. ${summary}`.trim(),
      };
    } catch (error) {
      return { summary: `Unlocked, but the demo sandbox could not be prepared: ${schemaHint(error instanceof Error ? error.message : String(error))}` };
    }
  },

  // Forgetting the code on this browser also throws its sandbox away; the next unlock starts clean.
  async onLock() {
    if (!isSupabaseConfigured()) return [];
    const admin = createSupabaseAdminClient();
    if (!admin) return [];
    return dropWorkspace(admin);
  },

  async sandboxLabel() {
    if (!isSupabaseConfigured()) return "In-memory demo data · shared by everyone on this server · resets when the beta code is entered";
    const admin = createSupabaseAdminClient();
    if (!admin || !discoveryEnabled()) return null;
    const workspace = await resolveWorkspace(admin).catch(() => null);
    return workspace ? describeWorkspace(workspace) : null;
  },

  async diagnostics() {
    if (!isSupabaseConfigured()) return [];
    const warnings: string[] = [];
    const admin = createSupabaseAdminClient();
    if (!admin) {
      warnings.push("SUPABASE_SERVICE_ROLE_KEY is missing or empty on this server. Live personas, tenant sessions, and demo sandboxes need it. Set it in the hosting environment and redeploy.");
      return warnings;
    }
    const probe = await admin.from("organizations").select("id", { count: "exact", head: true });
    if (probe.error) {
      warnings.push(`Database check failed: ${probe.error.message}`);
      return warnings;
    }
    const missing = await missingMigrations(admin);
    if (missing.length) {
      warnings.push(
        `Database schema is behind the app. In the Supabase dashboard open SQL Editor and run these files from supabase/migrations, in this order: ${missing.join(", ")}. Then refresh this page.`,
      );
    }
    return warnings;
  },
};

// ---------------------------------------------------------------------------------------------
// Schema drift check. One marker (table + column it introduces) per migration; if the marker is
// absent, that migration has not been applied. Index-only migrations have no marker and are
// assumed missing whenever the migration before them is missing.

/** Appends a pointer to the migration list when a Supabase error is really a missing table/column. */
function schemaHint(message: string): string {
  return /schema cache|does not exist/i.test(message)
    ? `${message}. The database is missing a migration — open /dev/personas for the list of SQL files to run.`
    : message;
}

type SchemaMarker = { migration: string; table?: string; column?: string };

const SCHEMA_MARKERS: SchemaMarker[] = [
  { migration: "20260829_base_schema.sql", table: "organizations", column: "slug" },
  { migration: "20260830_approved_vendor_network.sql", table: "vendors", column: "approval_status" },
  { migration: "20260831134025_vendor_network_operations_slice.sql", table: "maintenance_requests", column: "service_category_id" },
  { migration: "20260831152442_vendor_network_automation_and_security.sql", table: "homes", column: "latitude" },
  { migration: "20260912180000_vendor_work_order_performance.sql" },
  { migration: "20260918214500_vendor_recruitment_pipeline.sql", table: "vendor_prospects", column: "id" },
  { migration: "20260921140000_auto_assign_settings.sql", table: "organizations", column: "settings" },
  { migration: "20260921153000_vendor_reverse_auction.sql", table: "vendor_bid_opportunities", column: "id" },
  { migration: "20260921180000_vendor_job_field_work.sql", table: "vendor_users", column: "id" },
  { migration: "20260921190000_rental_listing_syndication.sql", table: "rental_listings", column: "id" },
  { migration: "20260921200000_rent_charges.sql", table: "rent_charges", column: "id" },
  { migration: "20260921210000_property_books.sql", table: "financial_transactions", column: "source" },
  { migration: "20260926090000_owner_portal.sql", table: "owner_users", column: "id" },
  { migration: "20260926093000_tenant_portal.sql", table: "tenant_sessions", column: "id" },
];

async function missingMigrations(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>): Promise<string[]> {
  const checks = await Promise.all(
    SCHEMA_MARKERS.map(async (marker) => {
      if (!marker.table || !marker.column) return null; // decided from the previous marker below
      const { error } = await admin.from(marker.table).select(marker.column, { head: true }).limit(0);
      return !error;
    }),
  );
  const missing: string[] = [];
  let previousPresent = true;
  checks.forEach((present, index) => {
    const resolved = present === null ? previousPresent : present;
    if (!resolved) missing.push(SCHEMA_MARKERS[index].migration);
    previousPresent = resolved;
  });
  return missing;
}
