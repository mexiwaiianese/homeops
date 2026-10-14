import { createHmac, timingSafeEqual } from "node:crypto";
import { appOrigin } from "@/lib/http-security";
import { decryptSecret, encryptSecret } from "@/lib/qbo/crypto";
import {
  QboApiError,
  intuitTidFrom,
  qboEndpointLabel,
  qboLogOf,
  qboMethod,
  redactQboText,
  reportQboFailure,
  tidInText,
  type QboErrorLog,
} from "@/lib/qbo/log";

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
  recordError?: (log: QboErrorLog) => Promise<void> | void;
};

export class QboAuthError extends Error {
  readonly log?: QboErrorLog;

  constructor(message: string, log?: QboErrorLog) {
    const tid = log?.intuitTid && !message.includes(log.intuitTid) ? ` intuit_tid ${log.intuitTid}` : "";
    super(`${message}${tid}`.trim());
    this.name = "QboAuthError";
    this.log = log;
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
  const log = qboLogOf(error);
  const message = typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "QuickBooks request failed.";
  const tid = log?.intuitTid || tidInText(message);
  if (/access_token|refresh_token|bearer |client_secret|authorization:/i.test(message)) {
    return tid ? `QuickBooks needs to be connected again. intuit_tid ${tid}` : "QuickBooks needs to be connected again.";
  }
  const cleaned = redactQboText(message).replace(/\s*intuit_tid[:\s]+\S+/gi, "").replace(/\s+/g, " ").trim();
  const body = (cleaned || "QuickBooks request failed.").slice(0, 180);
  return tid ? `${body} intuit_tid ${tid}` : body;
}

export async function exchangeQuickBooksCode(input: { code: string; redirectUri: string; realmId?: string }) {
  return tokenRequest(new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
  }), { realmId: input.realmId });
}

export async function quickBooksRequest(session: QboSession, path: string, init?: RequestInit) {
  if (Date.parse(session.credentials.expiresAt) < Date.now() + 60_000) {
    const refreshed = await tokenRequest(new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: session.credentials.refreshToken,
    }), { realmId: session.realmId, recordError: session.recordError });
    session.credentials = { ...refreshed, realmId: refreshed.realmId || session.credentials.realmId };
    await session.persist(session.credentials);
  }
  const method = qboMethod(init?.method);
  const endpoint = qboEndpointLabel(path);
  const joiner = path.includes("?") ? "&" : "?";
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/${encodeURIComponent(session.realmId)}/${path}${joiner}minorversion=75`, {
      ...init,
      headers: {
        Authorization: `Bearer ${session.credentials.accessToken}`,
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch (error) {
    const log = await reportQboFailure({
      status: 0,
      intuitTid: "",
      method,
      endpoint,
      realmId: session.realmId,
      payload: { error: "network", error_description: networkMessage(error) },
      recordError: session.recordError,
    });
    throw new QboApiError(log);
  }
  const payload = await readBody(response);
  if (!response.ok) {
    const log = await reportQboFailure({
      status: response.status,
      intuitTid: intuitTidFrom(response.headers, payload),
      method,
      endpoint,
      realmId: session.realmId,
      payload,
      recordError: session.recordError,
    });
    if (response.status === 401) throw new QboAuthError("QuickBooks needs to be connected again.", log);
    throw new QboApiError(log);
  }
  return payload as Record<string, unknown>;
}

export async function qboQuery(session: QboSession, sql: string) {
  return quickBooksRequest(session, `query?query=${encodeURIComponent(sql)}`);
}

async function tokenRequest(body: URLSearchParams, context?: { realmId?: string; recordError?: QboSession["recordError"] }): Promise<QboCredentials> {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID?.trim();
  const secret = process.env.QUICKBOOKS_CLIENT_SECRET?.trim();
  if (!clientId || !secret) throw new Error("QuickBooks OAuth is not configured.");
  let response: Response;
  try {
    response = await fetch(TOKEN, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });
  } catch (error) {
    const log = await reportQboFailure({
      status: 0,
      intuitTid: "",
      method: "POST",
      endpoint: "oauth/token",
      realmId: context?.realmId,
      payload: { error: "network", error_description: networkMessage(error) },
      recordError: context?.recordError,
    });
    throw new QboAuthError("QuickBooks authorization failed.", log);
  }
  const payload = await readBody(response);
  const token = tokenFields(payload);
  if (!response.ok || !token.accessToken || !token.refreshToken) {
    const log = await reportQboFailure({
      status: response.status,
      intuitTid: intuitTidFrom(response.headers, payload),
      method: "POST",
      endpoint: "oauth/token",
      realmId: context?.realmId,
      payload,
      recordError: context?.recordError,
    });
    throw new QboAuthError("QuickBooks authorization failed.", log);
  }
  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: new Date(Date.now() + (token.expiresIn || 3600) * 1000).toISOString(),
    tokenType: "Bearer",
  };
}

async function readBody(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text.slice(0, 1500) };
  }
}

function tokenFields(payload: unknown) {
  const record = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  return {
    accessToken: typeof record.access_token === "string" ? record.access_token : "",
    refreshToken: typeof record.refresh_token === "string" ? record.refresh_token : "",
    expiresIn: typeof record.expires_in === "number" ? record.expires_in : 0,
  };
}

function networkMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "QuickBooks could not be reached.";
  return redactQboText(message).replace(/https?:\/\/\S+/g, "[url]").slice(0, 500);
}
