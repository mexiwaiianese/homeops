import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getPersonaLoginConfig } from "@/lib/persona-login/config";

/** How long an emailed operator link stays valid. */
const LINK_MS = 20 * 60 * 1000;

export function devToolsEnabled() {
  return process.env.NODE_ENV !== "production";
}

/** Addresses that may receive an operator login link. Empty means any address, and only outside production. */
export function operatorEmails() {
  return getPersonaLoginConfig().allowedEmails;
}

function sign(payload: string) {
  return createHmac("sha256", getPersonaLoginConfig().cookieSecret).update(payload).digest("hex");
}

const usedNonces: Set<string> =
  ((globalThis as typeof globalThis & { __homeopsDevLoginNonces?: Set<string> }).__homeopsDevLoginNonces ??= new Set());

export function issueDevLoginToken(email: string) {
  const payload = Buffer.from(JSON.stringify({
    email,
    expires: Date.now() + LINK_MS,
    nonce: randomBytes(8).toString("hex"),
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Returns the email when the token is valid. Each token works once. */
export function consumeDevLoginToken(token: string) {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  let parsed: { email?: string; expires?: number; nonce?: string };
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
  if (!parsed.email || !parsed.nonce || !parsed.expires || parsed.expires < Date.now()) return null;
  if (usedNonces.has(parsed.nonce)) return null;
  usedNonces.add(parsed.nonce);
  return parsed.email;
}
