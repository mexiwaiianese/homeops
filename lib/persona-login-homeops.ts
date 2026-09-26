// HomeOps adapter for the reusable persona login (lib/persona-login).
//
// Demo mode (no Supabase env): personas are the seeded manager, owners, tenants, and vendors and
// sign-in sets the same cookies the real demo pickers set.
//
// Live mode (Supabase configured): personas are discovered from the database — one manager persona
// per organization plus every owner, tenant, and vendor row (capped per group). Sign-in never touches
// a real person's login. Each persona gets its own synthetic identity (<group>-<id>@persona.example.com)
// that is created on first use and linked with organization_members / owner_users / vendor_users, so
// the persona sees exactly what that owner, vendor, or manager would see. Tenant personas get a row in
// tenant_sessions exactly like a consumed sign-in link would. Set PERSONA_LOGIN_LIVE_DISCOVERY=false
// to turn discovery off and rely only on PERSONA_LOGIN_LIVE_PERSONAS.
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
// Live personas: discovered from the database

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

async function discoverPersonas(admin: SupabaseClient): Promise<Persona[]> {
  const [orgs, owners, tenants, vendors, homes, leases] = await Promise.all([
    admin.from("organizations").select("id, name").order("created_at").limit(5),
    admin.from("owners").select("id, organization_id, full_name, email").order("created_at").limit(DISCOVERY_CAP),
    admin.from("tenants").select("id, organization_id, full_name, email").order("created_at").limit(DISCOVERY_CAP),
    admin.from("vendors").select("id, organization_id, name, trade, city, state").order("created_at").limit(DISCOVERY_CAP),
    admin.from("homes").select("id, owner_id, address1, city, state").limit(200),
    admin.from("leases").select("tenant_id, home_id, status").limit(400),
  ]);
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
      label: `Manager · ${org.name}`,
      description: "Operations desk, maintenance, books, listings for this organization",
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
    const discovered = await discoverPersonas(admin);
    const seen = new Set(explicit.map((row) => row.id));
    return [...explicit, ...discovered.filter((row) => !seen.has(row.id))];
  } catch (error) {
    console.warn("[persona-login] live discovery failed", error);
    return explicit;
  }
}

/** Sign the SSR client in as `email` through an admin-generated magic link. Returns the auth user id. */
async function signInSupabaseUser(admin: SupabaseClient, email: string) {
  // generateLink creates the auth user when it does not exist yet, so a fresh identity works the first time.
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return { error: error?.message || "Supabase did not return a sign-in token." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "Supabase is not configured." };
  const verify = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (verify.error || !verify.data.user) return { error: verify.error?.message || "Sign-in did not return a user." };
  return { userId: verify.data.user.id };
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
    if (error) return { ok: false, error: error.message, status: 500 };
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
    link = await admin.from("organization_members").upsert({ organization_id: meta.organizationId, user_id: signedIn.userId, role: "manager" }, { onConflict: "organization_id,user_id" });
  } else if (persona.group === "owner" && meta.ownerId && meta.organizationId) {
    link = await admin.from("owner_users").upsert({ organization_id: meta.organizationId, owner_id: meta.ownerId, email: meta.email, role: "owner", ...stamp }, { onConflict: "owner_id,email" });
  } else if (persona.group === "vendor" && meta.vendorId && meta.organizationId) {
    link = await admin.from("vendor_users").upsert({ organization_id: meta.organizationId, vendor_id: meta.vendorId, email: meta.email, role: "dispatcher", ...stamp }, { onConflict: "vendor_id,email" });
  }
  if (link.error) return { ok: false, error: `Signed in, but could not link the persona: ${link.error.message}`, status: 500 };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Live seed: put the demo organization into an empty Supabase project so personas exist.
// Idempotent — keyed on the org slug and record names, so re-running never duplicates rows.

const DEMO_ORG_SLUG = "homeops-demo-management";

async function seedLiveDemo(): Promise<{ ok: true; summary: string } | { ok: false; error: string; status?: number }> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Seeding needs SUPABASE_SERVICE_ROLE_KEY on the server.", status: 503 };

  const org = await admin
    .from("organizations")
    .upsert({ name: "HomeOps Demo Management", slug: DEMO_ORG_SLUG }, { onConflict: "slug" })
    .select("id")
    .single();
  if (org.error || !org.data) return { ok: false, error: `organizations: ${org.error?.message || "no row"}` };
  const organizationId = org.data.id as string;
  const created = { owners: 0, homes: 0, tenants: 0, leases: 0, vendors: 0 };

  // Owners (by full_name within the org)
  const ownerIds = new Map<string, string>();
  for (const owner of demoOwners) {
    const existing = await admin.from("owners").select("id").eq("organization_id", organizationId).eq("full_name", owner.name).maybeSingle();
    if (existing.data) { ownerIds.set(owner.id, existing.data.id); continue; }
    const inserted = await admin
      .from("owners")
      .insert({
        organization_id: organizationId,
        full_name: owner.name,
        email: owner.email,
        maintenance_authority_cents: owner.auth * 100,
        emergency_authority_cents: owner.emergency * 100,
        minimum_reserve_cents: owner.reserve * 100,
        notify_over_cents: owner.notifyOver * 100,
        preferred_vendor_name: owner.preferred,
        disbursement_day: owner.disbursement.startsWith("15") ? 15 : 10,
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) return { ok: false, error: `owners: ${inserted.error?.message}` };
    ownerIds.set(owner.id, inserted.data.id);
    created.owners += 1;
  }

  // Tenants (by full_name within the org)
  const tenantIds = new Map<string, string>();
  for (const tenant of demoTenants) {
    const existing = await admin.from("tenants").select("id").eq("organization_id", organizationId).eq("full_name", tenant.name).maybeSingle();
    if (existing.data) { tenantIds.set(tenant.id, existing.data.id); continue; }
    const inserted = await admin
      .from("tenants")
      .insert({ organization_id: organizationId, full_name: tenant.name, email: tenant.email, phone: tenant.phone })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) return { ok: false, error: `tenants: ${inserted.error?.message}` };
    tenantIds.set(tenant.id, inserted.data.id);
    created.tenants += 1;
  }

  // Homes + active leases (by address within the org)
  for (const home of homes) {
    const ownerId = ownerIds.get(home.ownerId);
    const tenantId = tenantIds.get(home.tenantId);
    if (!ownerId || !tenantId) continue;
    const [city, state] = home.city.split(",").map((part) => part.trim());
    let homeId: string | null = null;
    const existing = await admin.from("homes").select("id").eq("organization_id", organizationId).eq("address1", home.address).maybeSingle();
    if (existing.data) homeId = existing.data.id;
    else {
      const inserted = await admin
        .from("homes")
        .insert({
          organization_id: organizationId,
          owner_id: ownerId,
          address1: home.address,
          city: city || "Example City",
          state: state || "UT",
          monthly_rent_cents: home.rent * 100,
          reserve_balance_cents: home.reserve * 100,
          health_status: home.health,
          access_notes: home.access,
        })
        .select("id")
        .single();
      if (inserted.error || !inserted.data) return { ok: false, error: `homes: ${inserted.error?.message}` };
      homeId = inserted.data.id;
      created.homes += 1;
    }
    const lease = await admin.from("leases").select("id").eq("home_id", homeId).eq("tenant_id", tenantId).maybeSingle();
    if (!lease.data) {
      const inserted = await admin.from("leases").insert({
        organization_id: organizationId,
        home_id: homeId,
        tenant_id: tenantId,
        starts_on: "2026-03-01",
        ends_on: home.leaseEnds,
        rent_cents: home.rent * 100,
        deposit_cents: home.rent * 100,
        status: "active",
      });
      if (inserted.error) return { ok: false, error: `leases: ${inserted.error.message}` };
      created.leases += 1;
    }
  }

  // Vendors (by name within the org)
  for (const vendor of demoVendors) {
    const existing = await admin.from("vendors").select("id").eq("organization_id", organizationId).eq("name", vendor.name).maybeSingle();
    if (existing.data) continue;
    const inserted = await admin.from("vendors").insert({
      organization_id: organizationId,
      name: vendor.name,
      trade: vendor.trade,
      email: vendor.email,
      phone: vendor.phone,
      city: vendor.city,
      state: vendor.state,
      workflow_stage: vendor.workflow_stage,
      approval_status: vendor.approval_status,
      emergency_available: vendor.emergency_available,
      expected_response_minutes: vendor.expected_response_minutes,
      minimum_trip_charge_cents: vendor.minimum_trip_charge_cents,
      hourly_rate_cents: vendor.hourly_rate_cents,
    });
    if (inserted.error) return { ok: false, error: `vendors: ${inserted.error.message}` };
    created.vendors += 1;
  }

  const parts = Object.entries(created).filter(([, count]) => count > 0).map(([table, count]) => `${count} ${table}`);
  return { ok: true, summary: parts.length ? `Created ${parts.join(", ")} in "HomeOps Demo Management".` : "Demo data was already present; nothing new created." };
}

// ---------------------------------------------------------------------------------------------

export const homeopsPersonaLogin: PersonaLoginAdapter = {
  async listPersonas() {
    return isSupabaseConfigured() ? livePersonas() : demoPersonas();
  },

  async signIn(persona) {
    return isSupabaseConfigured() ? liveSignIn(persona) : demoSignIn(persona);
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

  async seed() {
    if (!isSupabaseConfigured()) return { ok: true, summary: "Demo mode already has its seed data in memory." };
    return seedLiveDemo();
  },

  async diagnostics() {
    if (!isSupabaseConfigured()) return [];
    const warnings: string[] = [];
    const admin = createSupabaseAdminClient();
    if (!admin) {
      warnings.push("SUPABASE_SERVICE_ROLE_KEY is missing or empty on this server. Live personas, tenant sessions, and demo seeding need it. Set it in the hosting environment and redeploy.");
      return warnings;
    }
    const probe = await admin.from("organizations").select("id", { count: "exact", head: true });
    if (probe.error) warnings.push(`Database check failed: ${probe.error.message}`);
    else if ((probe.count ?? 0) === 0) warnings.push("The database has no organizations yet. Use “Create demo data” to add the demo organization.");
    return warnings;
  },
};
