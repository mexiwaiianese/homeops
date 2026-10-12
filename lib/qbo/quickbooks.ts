import { createHmac, timingSafeEqual } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/qbo/crypto";

const AUTH = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

export type QboCredentials = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  tokenType?: string;
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

export function appOrigin(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (!configured || /localhost|127\.0\.0\.1/.test(requestOrigin)) return requestOrigin;
  return configured;
}

export function quickBooksRedirectUri(origin: string) {
  return `${origin}/api/financial/qbo/callback`;
}

function stateSecret() {
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("INTEGRATION_ENCRYPTION_KEY is required before QuickBooks can connect.");
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
    session.credentials = refreshed;
    await session.persist(refreshed);
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
  if (!response.ok) throw new Error(quickBooksError(payload) || `QuickBooks returned ${response.status}.`);
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

function quickBooksError(payload: Record<string, unknown>) {
  const fault = payload.Fault as { Error?: { Message?: string; Detail?: string }[] } | undefined;
  return fault?.Error?.[0]?.Detail || fault?.Error?.[0]?.Message || "";
}
