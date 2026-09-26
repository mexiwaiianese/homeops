// HomeOps adapter for the reusable persona login (lib/persona-login).
//
// Demo mode (no Supabase env): personas are the seeded manager, owners, tenants, and vendors and
// sign-in sets the same cookies the real demo pickers set.
//
// Live mode (Supabase configured): personas come from PERSONA_LOGIN_LIVE_PERSONAS, a JSON array of
// test accounts you control. Email personas are signed in through Supabase Auth using an admin
// generated magic-link token that is verified server-side, so the tester never needs the inbox.
// Tenant personas get a row in tenant_sessions exactly like a consumed sign-in link would.
//
//   PERSONA_LOGIN_LIVE_PERSONAS='[
//     {"id":"manager","group":"manager","label":"Pilot manager","email":"manager@pilot.example"},
//     {"id":"owner-jane","group":"owner","label":"Owner: Jane","email":"jane@pilot.example"},
//     {"id":"tenant-main","group":"tenant","label":"Tenant: 123 Main St","tenantId":"<tenants.id uuid>"},
//     {"id":"vendor-acme","group":"vendor","label":"Vendor: ACME Plumbing","email":"dispatch@acme.example"}
//   ]'

import { createHash, randomBytes } from "crypto";
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
// Live personas (PERSONA_LOGIN_LIVE_PERSONAS)

type LivePersonaInput = { id?: string; group?: string; label?: string; description?: string; email?: string; tenantId?: string; landingPath?: string };

function livePersonas(): Persona[] {
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

async function liveSignIn(persona: Persona): Promise<PersonaSignInResult> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, error: "Persona login in live mode needs SUPABASE_SERVICE_ROLE_KEY on the server.", status: 503 };

  if (persona.group === "tenant") {
    const tenantId = persona.meta?.tenantId;
    if (!tenantId) return { ok: false, error: "Tenant persona is missing tenantId." };
    const { data: row } = await admin.from("tenants").select("id, organization_id").eq("id", tenantId).maybeSingle();
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

  const email = persona.meta?.email;
  if (!email) return { ok: false, error: "Persona is missing an email." };
  // generateLink creates the auth user when it does not exist yet, so a fresh test account works
  // the first time. Owner/vendor linkage still follows the normal first-sign-in rules
  // (owner_users / vendor_users rows keyed by email).
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) return { ok: false, error: error?.message || "Supabase did not return a sign-in token.", status: 502 };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured.", status: 503 };
  const verify = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (verify.error) return { ok: false, error: verify.error.message, status: 502 };
  return { ok: true };
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
};
