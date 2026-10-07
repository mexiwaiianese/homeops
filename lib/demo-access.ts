import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { owners as demoOwners } from "@/lib/data";
import { baseCookieOptions } from "@/lib/persona-login/gate";
import type { CookieToSet } from "@/lib/persona-login/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { vendors as demoVendors } from "@/lib/vendor-demo";

const demoOwnerCookie = "homeops_owner_demo";
const demoVendorCookie = "homeops_vendor_demo";

export const DEMO_ROLES = ["manager", "owner", "vendor"] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];

export const demoSessionCookie = "homeops_demo";
const TOKEN_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE = 14 * 24 * 60 * 60;
/** The no-email peek lasts two hours. */
const PEEK_MAX_AGE = 2 * 60 * 60;

/** Cookie payload mode tokens. A read-only peek is "ro"; the emailed demo is "rw". */
export const DEMO_MODE_READ_ONLY = "ro";
const DEMO_MODE_READ_WRITE = "rw";

export type DemoSession = {
  email: string;
  role: DemoRole;
  expires: number;
  /** True for the "Peek first - no email" session. Mutating API calls are refused. */
  readOnly: boolean;
};

type StoredToken = {
  hash: string;
  email: string;
  role: DemoRole;
  expiresAt: number;
  consumedAt: number | null;
};

const memoryTokens: Map<string, StoredToken> =
  ((globalThis as typeof globalThis & { __homeopsDemoTokens?: Map<string, StoredToken> }).__homeopsDemoTokens ??= new Map());

const revokedDemoNonces: Map<string, number> =
  ((globalThis as typeof globalThis & { __homeopsRevokedDemoNonces?: Map<string, number> }).__homeopsRevokedDemoNonces ??= new Map());

function secret() {
  return (
    process.env.PERSONA_LOGIN_COOKIE_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "portonos-demo-access"
  );
}

function hmac(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function isDemoRole(value: unknown): value is DemoRole {
  return DEMO_ROLES.includes(String(value) as DemoRole);
}

export function demoLandingPath(role: DemoRole) {
  if (role === "owner") return "/owners";
  if (role === "vendor") return "/vendors/desk";
  return "/demo";
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export async function issueDemoAccessToken(input: { email: string; role: DemoRole }) {
  const email = normalizeEmail(input.email);
  const token = randomBytes(24).toString("hex");
  const hash = sha256(token);
  const expiresAt = Date.now() + TOKEN_MS;
  memoryTokens.set(hash, { hash, email, role: input.role, expiresAt, consumedAt: null });
  const admin = createSupabaseAdminClient();
  if (admin) {
    await admin.from("demo_access_tokens").insert({
      token_hash: hash,
      email,
      role: input.role,
      expires_at: new Date(expiresAt).toISOString(),
    }).then(({ error }) => {
      if (error) console.warn("[demo-access] could not persist token", error.message);
    });
  }
  return { token, hash, email, role: input.role, expiresAt };
}

export async function consumeDemoAccessToken(token: string) {
  const hash = sha256(token);
  const now = Date.now();
  let row: StoredToken | null = memoryTokens.get(hash) ?? null;
  const admin = createSupabaseAdminClient();
  if (!row && admin) {
    const { data } = await admin.from("demo_access_tokens").select("*").eq("token_hash", hash).maybeSingle();
    if (data) {
      row = {
        hash,
        email: String(data.email),
        role: data.role as DemoRole,
        expiresAt: new Date(data.expires_at).getTime(),
        consumedAt: data.consumed_at ? new Date(data.consumed_at).getTime() : null,
      };
    }
  }
  if (!row || !isDemoRole(row.role) || row.expiresAt < now || row.consumedAt) return null;
  row.consumedAt = now;
  memoryTokens.set(hash, row);
  if (admin) {
    await admin.from("demo_access_tokens").update({ consumed_at: new Date(now).toISOString() }).eq("token_hash", hash);
  }
  return { email: row.email, role: row.role };
}

export function issueDemoSessionCookie(session: { email: string; role: DemoRole; readOnly?: boolean }): CookieToSet {
  const maxAge = session.readOnly ? PEEK_MAX_AGE : SESSION_MAX_AGE;
  const expires = Date.now() + maxAge * 1000;
  const nonce = randomBytes(8).toString("hex");
  const mode = session.readOnly ? DEMO_MODE_READ_ONLY : DEMO_MODE_READ_WRITE;
  const payload = `${expires}.${session.role}.${Buffer.from(session.email).toString("base64url")}.${nonce}.${mode}`;
  return {
    name: demoSessionCookie,
    value: `${payload}.${hmac(payload)}`,
    options: baseCookieOptions(maxAge),
  };
}

/** The read-only manager peek. No email, no token, nothing saved. */
export function issuePeekSessionCookie(): CookieToSet {
  return issueDemoSessionCookie({ email: "", role: "manager", readOnly: true });
}

export function clearDemoSessionCookie(): CookieToSet {
  return { name: demoSessionCookie, value: "", options: baseCookieOptions(0) };
}

export function verifyDemoSessionCookie(raw?: string | null): DemoSession | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!safeEqual(signature, hmac(payload))) return null;
  const [expires, role, emailB64, nonce, mode] = payload.split(".");
  const revokedUntil = nonce ? revokedDemoNonces.get(nonce) : undefined;
  if (revokedUntil && revokedUntil > Date.now()) return null;
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now() || !isDemoRole(role)) return null;
  const readOnly = mode === DEMO_MODE_READ_ONLY;
  if (readOnly && role !== "manager") return null;
  let email = "";
  try {
    email = Buffer.from(emailB64, "base64url").toString();
  } catch {
    return null;
  }
  if (!readOnly && !validEmail(email)) return null;
  return { email, role, expires: Number(expires), readOnly };
}

/**
 * Cheap, unsigned read of the mode token, for the edge middleware that has no node crypto.
 * Safe to trust for refusing writes: stripping the "ro" token breaks the HMAC, so the server
 * then sees no demo session at all.
 */
/** Ends a demo or peek cookie even if the browser keeps sending it. */
export function revokeDemoSessionCookie(raw?: string | null) {
  if (!raw) return;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return;
  const [expires, , , nonce] = raw.slice(0, dot).split(".");
  if (!nonce || !/^\d+$/.test(expires || "")) return;
  revokedDemoNonces.set(nonce, Number(expires));
}

export function demoCookieLooksReadOnly(raw?: string | null) {
  if (!raw) return false;
  const parts = raw.split(".");
  return parts.length === 6 && parts[4] === DEMO_MODE_READ_ONLY;
}

function expireCookieHeader(name: string, secure: boolean) {
  return `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function applyClearedDemoCookies(response: {
  cookies: { set: (name: string, value: string, options: NonNullable<CookieToSet["options"]>) => void };
  headers?: { append: (name: string, value: string) => void };
}) {
  const gone = baseCookieOptions(0);
  for (const name of [demoSessionCookie, demoOwnerCookie, demoVendorCookie]) {
    response.cookies.set(name, "", gone);
    // Expire the opposite Secure flag too, so a leftover demo cookie actually dies.
    response.headers?.append("Set-Cookie", expireCookieHeader(name, !gone.secure));
  }
}

export async function getDemoSession(): Promise<DemoSession | null> {
  const raw = (await cookies()).get(demoSessionCookie)?.value;
  return verifyDemoSessionCookie(raw);
}

export function demoPersonaCookies(role: DemoRole): CookieToSet[] {
  if (role === "owner") {
    const ownerId = demoOwners[0]?.id || "o1";
    return [{ name: demoOwnerCookie, value: ownerId, options: baseCookieOptions(SESSION_MAX_AGE) }];
  }
  if (role === "vendor") {
    const vendorId = demoVendors.find((row) => row.workflow_stage !== "invited")?.id || demoVendors[0]?.id || "v1";
    return [{ name: demoVendorCookie, value: vendorId, options: baseCookieOptions(SESSION_MAX_AGE) }];
  }
  return [];
}
