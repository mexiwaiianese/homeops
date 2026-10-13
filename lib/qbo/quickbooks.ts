import { createHmac, timingSafeEqual } from "node:crypto";
import { appOrigin } from "@/lib/http-security";
import { decryptSecret, encryptSecret } from "@/lib/qbo/crypto";

export { appOrigin };

const AUTH = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

export type QboCredentials = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  tokenType?: string;
  realmId?: string;
};

export type QboSession = {
  realmId: string;
  credentials: QboCredentials;
  persist: (next: QboCredentials) => Promise<void>;
};

export class QboAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QboAuthError";
  }
}

export function quickBooksConfigured() {
  return Boolean(process.env.QUICKBOOKS_CLIENT_ID?.trim() && process.env.QUICKBOOKS_CLIENT_SECRET?.trim());
}

export function quickBooksEnvironment() {
  return process.env.QUICKBOOKS_ENVIRONMENT?.trim().toLowerCase() === "sandbox" ? "sandbox" : "production";
}

function apiBase() {
  return quickBooksEnvironment() === "sandbox"
    ? "https://sandbox-quickbooks.api.intuit.com/v3/company"
    : "https://quickbooks.api.intuit.com/v3/company";
}

export function quickBooksRedirectUri(origin: string) {
  return `${origin}/api/financial/qbo/callback`;
}

function stateSecret() {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY?.trim();
  if (!secret) throw new Error("Set INTEGRATION_ENCRYPTION_KEY before QuickBooks can connect.");
  return secret;
}

export function quickBooksAuthorizeUrl(input: { state: string; redirectUri: string }) {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID?.trim();
  if (!clientId) throw new Error("QuickBooks OAuth is not configured.");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: input.redirectUri,
    state: input.state,
  });
  return `${AUTH}?${params}`;
}

export function oauthState(input: { organizationId: string; userId: string; returnTo?: string }) {
  const payload = Buffer.from(JSON.stringify({ ...input, provider: "quickbooks", exp: Date.now() + 10 * 60_000 })).toString("base64url");
  const signature = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyOauthState(value: string) {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(createHmac("sha256", stateSecret()).update(payload).digest("base64url"));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      organizationId?: string;
      userId?: string;
      provider?: string;
      returnTo?: string;
      exp?: number;
    };
    if (!parsed.organizationId || !parsed.userId || parsed.provider !== "quickbooks" || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function credentialsFromEncrypted(value: string): QboCredentials {
  return JSON.parse(decryptSecret(value)) as QboCredentials;
}

export function encryptCredentials(value: QboCredentials) {
  return encryptSecret(JSON.stringify(value));
}

/** Quote a value for a QuickBooks query. Dates must already be YYYY-MM-DD. */
export function qboQuoted(value: string) {
  const clean = value.replace(/[\u0000-\u001f]/g, "").slice(0, 200);
  return `'${clean.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export function qboDay(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function publicQboError(error: unknown) {
  const message = typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "QuickBooks request failed.";
  if (/access_token|refresh_token|bearer |client_secret|authorization:/i.test(message)) {
    return "QuickBooks needs to be connected again.";
  }
  const cleaned = message.replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 180) || "QuickBooks request failed.";
}

export async function exchangeQuickBooksCode(input: { code: string; redirectUri: string }) {
  return tokenRequest(new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
  }));
}

export async function quickBooksRequest(session: QboSession, path: string, init?: RequestInit) {
  if (Date.parse(session.credentials.expiresAt) < Date.now() + 60_000) {
    const refreshed = await tokenRequest(new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: session.credentials.refreshToken,
    }));
    session.credentials = { ...refreshed, realmId: refreshed.realmId || session.credentials.realmId };
    await session.persist(session.credentials);
  }
  const joiner = path.includes("?") ? "&" : "?";
  const response = await fetch(`${apiBase()}/${encodeURIComponent(session.realmId)}/${path}${joiner}minorversion=75`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.credentials.accessToken}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (response.status === 401) throw new QboAuthError("QuickBooks needs to be connected again.");
  if (!response.ok) throw new Error(quickBooksError(payload, response.status));
  return payload;
}

export async function qboQuery(session: QboSession, sql: string) {
  return quickBooksRequest(session, `query?query=${encodeURIComponent(sql)}`);
}

async function tokenRequest(body: URLSearchParams): Promise<QboCredentials> {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID?.trim();
  const secret = process.env.QUICKBOOKS_CLIENT_SECRET?.trim();
  if (!clientId || !secret) throw new Error("QuickBooks OAuth is not configured.");
  const response = await fetch(TOKEN, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  const payload = await response.json().catch(() => ({})) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token || !payload.refresh_token) {
    throw new QboAuthError(payload.error_description || "QuickBooks authorization failed.");
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: new Date(Date.now() + (payload.expires_in || 3600) * 1000).toISOString(),
    tokenType: "Bearer",
  };
}

function quickBooksError(payload: Record<string, unknown>, status: number) {
  const fault = payload.Fault as { Error?: { Message?: string }[] } | undefined;
  const message = fault?.Error?.[0]?.Message?.replace(/\s+/g, " ").trim() || "";
  if (!message || /token|secret|bearer/i.test(message)) return `QuickBooks returned ${status}.`;
  return `QuickBooks returned ${status}: ${message.slice(0, 120)}`;
}
