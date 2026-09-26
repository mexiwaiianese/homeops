import { randomBytes } from "crypto";
import { homes, tenants } from "@/lib/data";
import type { TenantPaymentMethod, TenantPublic } from "@/lib/tenant-portal";

// Demo-mode tenant portal state. Mirrors the live tables in
// supabase/migrations/20260926090000_tenant_portal.sql but lives in process memory.

type LoginToken = { token: string; tenantId: string; expiresAt: number; consumedAt: number | null };
type Session = { id: string; tenantId: string; expiresAt: number };

type Store = {
  loginTokens: Map<string, LoginToken>;
  sessions: Map<string, Session>;
  paymentMethods: Map<string, TenantPaymentMethod[]>;
  stripeCustomers: Map<string, string>;
};

const store: Store =
  ((globalThis as typeof globalThis & { __homeopsTenantPortal?: Store }).__homeopsTenantPortal ??= {
    loginTokens: new Map(),
    sessions: new Map(),
    paymentMethods: new Map(),
    stripeCustomers: new Map(),
  });

export const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Forget saved payment methods and Stripe customers. Sessions stay so the caller is not logged out mid-reset. */
export function resetDemoTenantPortal() {
  store.loginTokens.clear();
  store.paymentMethods.clear();
  store.stripeCustomers.clear();
}

function digits(value?: string | null) {
  const d = (value ?? "").replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

export function demoTenantPublic(tenantId: string): TenantPublic | null {
  const tenant = tenants.find((row) => row.id === tenantId);
  if (!tenant) return null;
  const home = homes.find((row) => row.tenantId === tenant.id);
  return {
    id: tenant.id,
    name: tenant.name,
    email: tenant.email,
    phone: tenant.phone,
    address: home?.address || tenant.home,
    city: home?.city || "",
    homeId: home?.id || null,
    mode: "demo",
  };
}

export function findDemoTenantByContact(contact: string) {
  const trimmed = contact.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.includes("@")) return tenants.find((row) => row.email.toLowerCase() === trimmed) || null;
  const wanted = digits(trimmed);
  if (wanted.length !== 10) return null;
  return tenants.find((row) => digits(row.phone) === wanted) || null;
}

export function issueDemoLoginToken(tenantId: string) {
  const token = randomBytes(24).toString("hex");
  store.loginTokens.set(token, { token, tenantId, expiresAt: Date.now() + LOGIN_TOKEN_TTL_MS, consumedAt: null });
  return token;
}

export function consumeDemoLoginToken(token: string) {
  const row = store.loginTokens.get(token);
  if (!row) return { error: "This sign-in link is not valid." as const };
  if (row.consumedAt) return { error: "This sign-in link was already used. Request a new one." as const };
  if (row.expiresAt < Date.now()) return { error: "This sign-in link expired. Request a new one." as const };
  row.consumedAt = Date.now();
  const sessionId = randomBytes(24).toString("hex");
  store.sessions.set(sessionId, { id: sessionId, tenantId: row.tenantId, expiresAt: Date.now() + SESSION_TTL_MS });
  return { sessionId, tenantId: row.tenantId };
}

export function getDemoSession(sessionId: string) {
  const row = store.sessions.get(sessionId);
  if (!row) return null;
  if (row.expiresAt < Date.now()) { store.sessions.delete(sessionId); return null; }
  return row;
}

export function revokeDemoSession(sessionId: string) {
  store.sessions.delete(sessionId);
}

export function getDemoStripeCustomer(tenantId: string) {
  return store.stripeCustomers.get(tenantId) || null;
}

export function setDemoStripeCustomer(tenantId: string, customerId: string) {
  store.stripeCustomers.set(tenantId, customerId);
}

// Fake payment methods for demo mode without Stripe keys.
function seedMethods(tenantId: string) {
  if (store.paymentMethods.has(tenantId)) return;
  const seeded: TenantPaymentMethod[] = tenantId === "t3"
    ? []
    : [{ id: `pm-demo-${tenantId}-bank`, type: "us_bank_account", label: "Demo Checking ••••6789", last4: "6789", bankName: "Demo Checking", isDefault: true }];
  store.paymentMethods.set(tenantId, seeded);
}

export function listDemoPaymentMethods(tenantId: string) {
  seedMethods(tenantId);
  return store.paymentMethods.get(tenantId) || [];
}

export function addDemoPaymentMethod(tenantId: string, input: { type: "card" | "us_bank_account"; last4?: string; brand?: string; bankName?: string }) {
  seedMethods(tenantId);
  const rows = store.paymentMethods.get(tenantId) || [];
  const last4 = (input.last4 || "").replace(/\D/g, "").slice(-4).padStart(4, "4") || "4242";
  const method: TenantPaymentMethod = {
    id: `pm-demo-${Date.now().toString(36)}`,
    type: input.type,
    brand: input.type === "card" ? input.brand || "visa" : null,
    bankName: input.type === "us_bank_account" ? input.bankName || "Demo Bank" : null,
    last4,
    label: input.type === "card" ? `${(input.brand || "Visa").replace(/^\w/, (c) => c.toUpperCase())} ••••${last4}` : `${input.bankName || "Demo Bank"} ••••${last4}`,
    expMonth: input.type === "card" ? 12 : null,
    expYear: input.type === "card" ? new Date().getFullYear() + 3 : null,
    isDefault: rows.length === 0,
  };
  store.paymentMethods.set(tenantId, [...rows, method]);
  return method;
}

export function setDemoDefaultPaymentMethod(tenantId: string, methodId: string) {
  const rows = listDemoPaymentMethods(tenantId);
  if (!rows.some((row) => row.id === methodId)) return { error: "Payment method not found." as const };
  store.paymentMethods.set(tenantId, rows.map((row) => ({ ...row, isDefault: row.id === methodId })));
  return { ok: true as const };
}

export function removeDemoPaymentMethod(tenantId: string, methodId: string) {
  const rows = listDemoPaymentMethods(tenantId);
  const remaining = rows.filter((row) => row.id !== methodId);
  if (remaining.length === rows.length) return { error: "Payment method not found." as const };
  if (remaining.length && !remaining.some((row) => row.isDefault)) remaining[0].isDefault = true;
  store.paymentMethods.set(tenantId, remaining);
  return { ok: true as const };
}
