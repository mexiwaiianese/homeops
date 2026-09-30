import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { baseCookieOptions } from "@/lib/persona-login/gate";

/** The only address that may open platform-admin tools (vendor recruitment). */
export const OPERATOR_ADMIN_EMAIL = "nathan@dbx.dev";

export const operatorSessionCookie = "homeops_operator";

const LINK_MS = 20 * 60 * 1000;
const SESSION_MAX_AGE = 14 * 24 * 60 * 60;

type AuthLike = {
  email?: string | null;
  email_confirmed_at?: string | null;
} | null | undefined;

function secret() {
  return (
    process.env.PERSONA_LOGIN_COOKIE_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    `operator:${OPERATOR_ADMIN_EMAIL}`
  );
}

function hmac(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function isOperatorEmail(email?: string | null) {
  return (email ?? "").trim().toLowerCase() === OPERATOR_ADMIN_EMAIL;
}

/** True for a confirmed sign-in whose email is the platform admin. */
export function isOperatorAdmin(user: AuthLike) {
  if (!user?.email || !isOperatorEmail(user.email)) return false;
  return Boolean(user.email_confirmed_at);
}

export function verifyOperatorCookie(raw?: string) {
  if (!raw) return false;
  const parts = raw.split(".");
  if (parts.length !== 3) return false;
  const [expires, nonce, signature] = parts;
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  return safeEqual(signature, hmac(`${expires}.${nonce}`));
}

export function issueOperatorCookie() {
  const maxAge = SESSION_MAX_AGE;
  const expires = Date.now() + maxAge * 1000;
  const nonce = randomBytes(8).toString("hex");
  const payload = `${expires}.${nonce}`;
  return {
    name: operatorSessionCookie,
    value: `${payload}.${hmac(payload)}`,
    options: baseCookieOptions(maxAge),
  };
}

export function clearOperatorCookie() {
  return { name: operatorSessionCookie, value: "", options: baseCookieOptions(0) };
}

const usedNonces: Set<string> =
  ((globalThis as typeof globalThis & { __homeopsOperatorNonces?: Set<string> }).__homeopsOperatorNonces ??= new Set());

export function issueOperatorLoginToken() {
  const payload = Buffer.from(JSON.stringify({
    email: OPERATOR_ADMIN_EMAIL,
    expires: Date.now() + LINK_MS,
    nonce: randomBytes(8).toString("hex"),
  })).toString("base64url");
  return `${payload}.${hmac(payload)}`;
}

/** Returns the admin email when the one-time link is valid. */
export function consumeOperatorLoginToken(token: string) {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, hmac(payload))) return null;
  let parsed: { email?: string; expires?: number; nonce?: string };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
  if (!isOperatorEmail(parsed.email) || !parsed.nonce || !parsed.expires || parsed.expires < Date.now()) return null;
  if (usedNonces.has(parsed.nonce)) return null;
  usedNonces.add(parsed.nonce);
  return OPERATOR_ADMIN_EMAIL;
}

export async function getOperatorAdmin() {
  const { user } = await getAuthedContext();
  if (isOperatorAdmin(user)) return { user, allowed: true as const };
  const raw = (await cookies()).get(operatorSessionCookie)?.value;
  return { user, allowed: verifyOperatorCookie(raw) };
}

export async function requirePlatformAdmin() {
  const { allowed, user } = await getOperatorAdmin();
  if (allowed) return { ok: true as const, user };
  return {
    ok: false as const,
    user,
    response: NextResponse.json({ error: "Platform admin required" }, { status: 403 }),
  };
}
