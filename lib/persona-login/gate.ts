// Persona login: who may use the switcher. Three ways in, checked in order:
//   1. "open"      no code and no allowlist configured (only possible outside production)
//   2. "code"      a valid HMAC-signed unlock cookie from a correct PERSONA_LOGIN_ACCESS_CODE
//   3. "allowlist" the app's current real user has an email in PERSONA_LOGIN_ALLOWED_EMAILS

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getPersonaLoginConfig, type PersonaLoginConfig } from "./config";
import type { CookieToSet, PersonaLoginAccess, PersonaLoginAdapter, PersonaLoginStatus } from "./types";

export const personaUnlockCookie = "persona_login_unlock";
export const personaActiveCookie = "persona_login_active";

function hmac(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function baseCookieOptions(maxAge: number): NonNullable<CookieToSet["options"]> {
  return { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge };
}

/** Build the unlock cookie after a correct access code. */
export function issueUnlockCookie(config: PersonaLoginConfig): CookieToSet {
  const maxAge = config.unlockDays * 24 * 60 * 60;
  const expires = Date.now() + maxAge * 1000;
  const nonce = randomBytes(8).toString("hex");
  const payload = `${expires}.${nonce}`;
  return { name: personaUnlockCookie, value: `${payload}.${hmac(config.cookieSecret, payload)}`, options: baseCookieOptions(maxAge) };
}

export function clearUnlockCookie(): CookieToSet {
  return { name: personaUnlockCookie, value: "", options: baseCookieOptions(0) };
}

export function verifyUnlockCookie(config: PersonaLoginConfig, raw: string | undefined) {
  if (!raw) return false;
  const parts = raw.split(".");
  if (parts.length !== 3) return false;
  const [expires, nonce, signature] = parts;
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  return safeEqual(signature, hmac(config.cookieSecret, `${expires}.${nonce}`));
}

export function accessCodeMatches(config: PersonaLoginConfig, candidate: string) {
  if (!config.accessCode) return false;
  return safeEqual(candidate.trim(), config.accessCode);
}

// Small in-process limiter for the unlock endpoint so a leaked URL cannot be brute-forced cheaply.
// Per-instance only; fine for a beta tool. Put the app behind an edge rate limit for anything more.
type Bucket = { count: number; resetAt: number };
const UNLOCK_WINDOW_MS = 15 * 60 * 1000;
const UNLOCK_MAX_ATTEMPTS = 10;
const buckets: Map<string, Bucket> =
  ((globalThis as typeof globalThis & { __personaLoginBuckets?: Map<string, Bucket> }).__personaLoginBuckets ??= new Map());

export function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0] || request.headers.get("x-real-ip") || "local").trim();
}

export function unlockAttemptAllowed(key: string) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + UNLOCK_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= UNLOCK_MAX_ATTEMPTS;
}

export function resetUnlockAttempts(key: string) {
  buckets.delete(key);
}

/** Decide whether the caller may list and assume personas. */
export async function resolvePersonaLoginAccess(adapter?: Pick<PersonaLoginAdapter, "currentUserEmail">): Promise<PersonaLoginAccess> {
  const config = getPersonaLoginConfig();
  if (!config.enabled) return { allowed: false, enabled: false, needsUnlock: false, reason: config.reason };
  if (!config.requiresUnlock) return { allowed: true, via: "open" };

  const jar = await cookies();
  if (verifyUnlockCookie(config, jar.get(personaUnlockCookie)?.value)) return { allowed: true, via: "code" };

  if (config.allowedEmails.length && adapter?.currentUserEmail) {
    const email = (await adapter.currentUserEmail().catch(() => null))?.toLowerCase();
    if (email && config.allowedEmails.includes(email)) return { allowed: true, via: "allowlist" };
  }

  return {
    allowed: false,
    enabled: true,
    needsUnlock: true,
    reason: config.accessCode ? "Enter the beta access code to continue." : "Sign in with an authorized beta email to continue.",
  };
}

export async function personaLoginStatus(adapter?: Pick<PersonaLoginAdapter, "currentUserEmail">): Promise<PersonaLoginStatus> {
  const config = getPersonaLoginConfig();
  const access = await resolvePersonaLoginAccess(adapter);
  return {
    enabled: config.enabled,
    unlocked: access.allowed,
    codeAvailable: Boolean(config.accessCode),
    allowlistAvailable: config.allowedEmails.length > 0,
    via: access.allowed ? access.via : null,
    environment: config.environment,
    reason: access.allowed ? undefined : access.reason,
  };
}

export async function activePersonaId() {
  return (await cookies()).get(personaActiveCookie)?.value || null;
}
