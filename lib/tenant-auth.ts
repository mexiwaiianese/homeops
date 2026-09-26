import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { sendVendorEmail, sendVendorSms } from "@/lib/vendor-outreach";
import { parseUsPhone } from "@/lib/vendor-prospects";
import { loginLinkCopy, tenantEnterPath, type TenantPublic } from "@/lib/tenant-portal";
import {
  LOGIN_TOKEN_TTL_MS,
  SESSION_TTL_MS,
  consumeDemoLoginToken,
  demoTenantPublic,
  findDemoTenantByContact,
  getDemoSession,
  issueDemoLoginToken,
  revokeDemoSession,
} from "@/lib/tenant-demo";

// Passwordless tenant access. A tenant asks for a link by email or mobile number, the link is
// single-use and short-lived, and exchanging it sets an httpOnly portal session cookie.
// Nothing here relies on Supabase Auth so SMS works the same as email.

export const tenantSessionCookie = "homeops_tenant_session";

export type TenantContext =
  | { mode: "demo"; tenant: TenantPublic; sessionId: string; admin: null; organizationId: null }
  | { mode: "live"; tenant: TenantPublic; sessionId: string; admin: SupabaseClient; organizationId: string }
  | null;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function liveMode() {
  return isSupabaseConfigured();
}

function tenantFromEmail() {
  return process.env.TENANT_FROM_EMAIL || process.env.VENDOR_OUTREACH_FROM_EMAIL;
}

type LiveTenantRow = {
  id: string;
  organization_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  leases?: Array<{ home_id: string; status: string; homes?: { id: string; address1: string; city: string; state: string } | Array<{ id: string; address1: string; city: string; state: string }> | null }> | null;
};

const liveTenantSelect = "id, organization_id, full_name, email, phone, leases(home_id, status, homes(id, address1, city, state))";

function mapLiveTenant(row: LiveTenantRow): TenantPublic {
  const active = (row.leases ?? []).find((lease) => lease.status === "active") || (row.leases ?? [])[0];
  const home = Array.isArray(active?.homes) ? active?.homes[0] : active?.homes;
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    phone: row.phone,
    address: home?.address1 || "Your home",
    city: home ? `${home.city}, ${home.state}` : "",
    homeId: home?.id || active?.home_id || null,
    mode: "live",
  };
}

async function findLiveTenantByContact(admin: SupabaseClient, contact: string) {
  const trimmed = contact.trim();
  if (trimmed.includes("@")) {
    const { data } = await admin.from("tenants").select(liveTenantSelect).ilike("email", trimmed).limit(1).maybeSingle();
    return (data as LiveTenantRow | null) ?? null;
  }
  const wanted = parseUsPhone(trimmed);
  if (!wanted) return null;
  const { data } = await admin.from("tenants").select(liveTenantSelect).like("phone", `%${wanted.slice(-4)}%`).limit(50);
  return ((data ?? []) as LiveTenantRow[]).find((row) => parseUsPhone(row.phone) === wanted) ?? null;
}

async function organizationName(admin: SupabaseClient | null, organizationId: string | null) {
  if (!admin || !organizationId) return "HomeOps";
  const { data } = await admin.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  return data?.name || "HomeOps";
}

export type LoginLinkResult = {
  found: boolean;
  channel: "email" | "sms" | null;
  sentTo: string | null;
  delivered: boolean;
  deliveryError: string | null;
  url: string | null;
};

/**
 * Create and deliver a sign-in link. `contact` is an email or US mobile number typed by the tenant.
 * Pass `tenantId` instead when a manager triggers the link from the operations desk.
 */
export async function requestTenantLoginLink(input: {
  contact?: string;
  tenantId?: string;
  preferredChannel?: "email" | "sms" | "auto";
  origin: string;
  requestedBy?: string | null;
}): Promise<LoginLinkResult> {
  const base = input.origin.replace(/\/$/, "");
  const none: LoginLinkResult = { found: false, channel: null, sentTo: null, delivered: false, deliveryError: null, url: null };

  if (!liveMode()) {
    const tenant = input.tenantId
      ? demoTenantPublic(input.tenantId)
      : (() => { const row = findDemoTenantByContact(input.contact || ""); return row ? demoTenantPublic(row.id) : null; })();
    if (!tenant) return none;
    const token = issueDemoLoginToken(tenant.id);
    const url = `${base}${tenantEnterPath(token)}`;
    return deliver({ tenant, url, preferredChannel: input.preferredChannel, contact: input.contact, organization: "HomeOps Demo Management" });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return none;
  const row = input.tenantId
    ? ((await admin.from("tenants").select(liveTenantSelect).eq("id", input.tenantId).maybeSingle()).data as LiveTenantRow | null)
    : await findLiveTenantByContact(admin, input.contact || "");
  if (!row) return none;
  const tenant = mapLiveTenant(row);
  const token = randomBytes(24).toString("hex");
  const url = `${base}${tenantEnterPath(token)}`;
  const orgName = await organizationName(admin, row.organization_id);
  const result = await deliver({ tenant, url, preferredChannel: input.preferredChannel, contact: input.contact, organization: orgName });
  await admin.from("tenant_login_tokens").insert({
    organization_id: row.organization_id,
    tenant_id: row.id,
    token_hash: sha256(token),
    channel: input.requestedBy ? "manager" : result.channel || "email",
    sent_to: result.sentTo,
    requested_by: input.requestedBy || null,
    expires_at: new Date(Date.now() + LOGIN_TOKEN_TTL_MS).toISOString(),
  });
  return result;
}

async function deliver(input: {
  tenant: TenantPublic;
  url: string;
  contact?: string;
  preferredChannel?: "email" | "sms" | "auto";
  organization: string;
}): Promise<LoginLinkResult> {
  const typedPhone = input.contact && !input.contact.includes("@") ? parseUsPhone(input.contact) : null;
  const typedEmail = input.contact && input.contact.includes("@") ? input.contact.trim() : null;
  const smsTarget = typedPhone ? `+1${typedPhone}` : parseUsPhone(input.tenant.phone) ? `+1${parseUsPhone(input.tenant.phone)}` : null;
  const emailTarget = typedEmail || input.tenant.email || null;

  let channel: "email" | "sms" | null = null;
  if (input.preferredChannel === "sms" && smsTarget) channel = "sms";
  else if (input.preferredChannel === "email" && emailTarget) channel = "email";
  else if (typedPhone && smsTarget) channel = "sms";
  else if (emailTarget) channel = "email";
  else if (smsTarget) channel = "sms";
  if (!channel) return { found: true, channel: null, sentTo: null, delivered: false, deliveryError: "No email or mobile number on file", url: input.url };

  const text = loginLinkCopy({ organizationName: input.organization, url: input.url, channel, tenantName: input.tenant.name });
  const send = channel === "email"
    ? await sendVendorEmail({ to: emailTarget!, subject: `Your ${input.organization} tenant portal link`, text, from: tenantFromEmail() })
    : await sendVendorSms({ to: smsTarget!, text });
  return {
    found: true,
    channel,
    sentTo: channel === "email" ? emailTarget : smsTarget,
    delivered: send.sent,
    deliveryError: send.error || null,
    url: input.url,
  };
}

/** Exchange a raw link token for a session. Returns the cookie value to set. */
export async function consumeTenantLoginToken(token: string, userAgent?: string | null) {
  if (!token || token.length < 16) return { error: "This sign-in link is not valid." };
  if (!liveMode()) {
    const result = consumeDemoLoginToken(token);
    if ("error" in result) return { error: result.error };
    return { cookieValue: `demo.${result.sessionId}`, tenantId: result.tenantId };
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "Tenant portal is not configured on this server." };
  const { data: row } = await admin
    .from("tenant_login_tokens")
    .select("id, organization_id, tenant_id, expires_at, consumed_at")
    .eq("token_hash", sha256(token))
    .maybeSingle();
  if (!row) return { error: "This sign-in link is not valid." };
  if (row.consumed_at) return { error: "This sign-in link was already used. Request a new one." };
  if (new Date(row.expires_at) < new Date()) return { error: "This sign-in link expired. Request a new one." };
  const now = new Date().toISOString();
  const { error: consumeError } = await admin
    .from("tenant_login_tokens")
    .update({ consumed_at: now })
    .eq("id", row.id)
    .is("consumed_at", null);
  if (consumeError) return { error: "This sign-in link is not valid." };
  const sessionToken = randomBytes(32).toString("hex");
  const { error } = await admin.from("tenant_sessions").insert({
    organization_id: row.organization_id,
    tenant_id: row.tenant_id,
    session_hash: sha256(sessionToken),
    login_token_id: row.id,
    user_agent: userAgent?.slice(0, 300) || null,
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
  if (error) return { error: error.message };
  await admin.from("tenants").update({ portal_last_seen_at: now }).eq("id", row.tenant_id);
  return { cookieValue: `live.${sessionToken}`, tenantId: row.tenant_id };
}

export function tenantSessionCookieOptions(maxAgeSeconds = SESSION_TTL_MS / 1000) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Resolve the signed-in tenant from the portal cookie. */
export async function getTenantContext(): Promise<TenantContext> {
  const raw = (await cookies()).get(tenantSessionCookie)?.value;
  if (!raw) return null;
  const [prefix, value] = raw.split(".", 2);
  if (!value) return null;

  if (prefix === "demo") {
    if (liveMode()) return null;
    const session = getDemoSession(value);
    if (!session) return null;
    const tenant = demoTenantPublic(session.tenantId);
    return tenant ? { mode: "demo", tenant, sessionId: value, admin: null, organizationId: null } : null;
  }
  if (prefix !== "live" || !liveMode()) return null;
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const { data: session } = await admin
    .from("tenant_sessions")
    .select("id, organization_id, tenant_id, expires_at, revoked_at, last_seen_at")
    .eq("session_hash", sha256(value))
    .maybeSingle();
  if (!session || session.revoked_at || new Date(session.expires_at) < new Date()) return null;
  const { data: row } = await admin.from("tenants").select(liveTenantSelect).eq("id", session.tenant_id).maybeSingle();
  if (!row) return null;
  if (Date.now() - new Date(session.last_seen_at).getTime() > 10 * 60 * 1000) {
    await admin.from("tenant_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", session.id);
  }
  return { mode: "live", tenant: mapLiveTenant(row as LiveTenantRow), sessionId: session.id, admin, organizationId: session.organization_id };
}

export async function revokeTenantSession(context: NonNullable<TenantContext>) {
  if (context.mode === "demo") { revokeDemoSession(context.sessionId); return; }
  await context.admin.from("tenant_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", context.sessionId);
}
