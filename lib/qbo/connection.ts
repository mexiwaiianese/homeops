import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { qboLogOf, type QboErrorLog } from "@/lib/qbo/log";
import { credentialsFromEncrypted, encryptCredentials, publicQboError, quickBooksConfigured, quickBooksEnvironment, type QboCredentials, type QboSession } from "@/lib/qbo/quickbooks";
import { isSyncDue, type QboSchedule, type QboSyncMode } from "@/lib/qbo/schedule";

const MANAGERS = new Set(["owner", "admin", "manager", "staff"]);

export type QboConnection = {
  id: string;
  organizationId: string;
  status: "disconnected" | "connected" | "error";
  realmId: string;
  companyName: string;
  syncMode: QboSyncMode;
  schedule: QboSchedule;
  nextRunAt: string | null;
  lastSyncedAt: string | null;
  lastError: string;
  metadata: Record<string, unknown>;
  encryptedCredentials: string;
  connectedBy: string;
};

export async function requireBooksManager() {
  const context = await getAuthedContext();
  if (!context.user || !context.organizationId) {
    return { ok: false as const, response: NextResponse.json({ error: "Sign in to connect QuickBooks." }, { status: 401 }) };
  }
  if (!context.supabase) {
    return { ok: false as const, response: NextResponse.json({ error: "QuickBooks connects on a live workspace." }, { status: 400 }) };
  }
  if (!context.role || !MANAGERS.has(context.role)) {
    return { ok: false as const, response: NextResponse.json({ error: "You need manager access to connect QuickBooks." }, { status: 403 }) };
  }
  const admin = createSupabaseAdminClient();
  if (!admin) {
    return { ok: false as const, response: NextResponse.json({ error: "QuickBooks needs the Supabase service role on this server." }, { status: 400 }) };
  }
  return { ok: true as const, admin, userId: context.user.id, organizationId: context.organizationId };
}

export async function loadQboConnection(admin: SupabaseClient, organizationId: string): Promise<QboConnection | null> {
  const { data, error } = await admin
    .from("accounting_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "quickbooks_online")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { data: secret, error: secretError } = await admin
    .from("qbo_credentials")
    .select("encrypted_credentials")
    .eq("connection_id", data.id)
    .maybeSingle();
  if (secretError) throw new Error(secretError.message);
  const encrypted = String(secret?.encrypted_credentials || "");
  const realmId = await sealRealm(admin, data, encrypted);
  return mapConnection({ ...data, realm_id: realmId }, encrypted);
}

export async function saveQboConnection(admin: SupabaseClient, input: {
  organizationId: string;
  userId?: string;
  realmId: string;
  companyName?: string;
  credentials: QboCredentials;
  metadata?: Record<string, unknown>;
}) {
  const existing = await loadQboConnection(admin, input.organizationId);
  const now = new Date().toISOString();
  const payload = {
    organization_id: input.organizationId,
    provider: "quickbooks_online",
    status: "connected",
    realm_id: null,
    company_name: input.companyName || existing?.companyName || "",
    metadata: input.metadata || existing?.metadata || {},
    last_error: "",
    connected_by: input.userId || existing?.connectedBy || null,
    updated_at: now,
  };
  const query = existing
    ? admin.from("accounting_connections").update(payload).eq("id", existing.id)
    : admin.from("accounting_connections").insert({ ...payload, sync_mode: "manual", schedule: {} });
  const { data, error } = await query.select("*").single();
  if (error) throw new Error(error.message);
  const encryptedCredentials = encryptCredentials({ ...input.credentials, realmId: input.realmId });
  const { error: secretError } = await admin.from("qbo_credentials").upsert({
    connection_id: data.id,
    organization_id: input.organizationId,
    encrypted_credentials: encryptedCredentials,
    updated_at: now,
  });
  if (secretError) throw new Error(secretError.message);
  return mapConnection({ ...data, realm_id: input.realmId }, encryptedCredentials);
}

async function sealRealm(admin: SupabaseClient, row: Record<string, any>, encrypted: string) {
  const plaintext = String(row.realm_id || "");
  if (!encrypted) return plaintext;
  try {
    const credentials = credentialsFromEncrypted(encrypted);
    if (credentials.realmId) {
      if (plaintext) await admin.from("accounting_connections").update({ realm_id: null }).eq("id", row.id);
      return credentials.realmId;
    }
    if (!plaintext) return "";
    await admin.from("qbo_credentials").update({
      encrypted_credentials: encryptCredentials({ ...credentials, realmId: plaintext }),
      updated_at: new Date().toISOString(),
    }).eq("connection_id", row.id);
    await admin.from("accounting_connections").update({ realm_id: null }).eq("id", row.id);
    return plaintext;
  } catch {
    return plaintext;
  }
}

export async function updateQboConnection(admin: SupabaseClient, organizationId: string, patch: Record<string, unknown>) {
  const { error } = await admin
    .from("accounting_connections")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("provider", "quickbooks_online");
  if (error) throw new Error(error.message);
}

export async function persistQboCredentials(admin: SupabaseClient, connection: QboConnection, credentials: QboCredentials) {
  const next = { ...credentials, realmId: credentials.realmId || connection.realmId };
  const { error } = await admin.from("qbo_credentials").upsert({
    connection_id: connection.id,
    organization_id: connection.organizationId,
    encrypted_credentials: encryptCredentials(next),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export function sessionFor(admin: SupabaseClient, connection: QboConnection, context?: { syncRunId?: string }): QboSession {
  if (!connection.encryptedCredentials) throw new Error("Connect QuickBooks first.");
  return {
    realmId: connection.realmId,
    credentials: { ...credentialsFromEncrypted(connection.encryptedCredentials), realmId: connection.realmId },
    persist: (next) => persistQboCredentials(admin, connection, next),
    recordError: (log) => storeQboErrorLog(admin, {
      organizationId: connection.organizationId,
      connectionId: connection.id,
      syncRunId: context?.syncRunId,
      log,
    }),
  };
}

export async function storeQboErrorLog(admin: SupabaseClient, input: {
  organizationId: string;
  connectionId?: string;
  syncRunId?: string;
  log: QboErrorLog;
}) {
  const { error } = await admin.from("qbo_api_logs").insert({
    organization_id: input.organizationId,
    connection_id: input.connectionId || null,
    sync_run_id: input.syncRunId || null,
    occurred_at: input.log.occurredAt,
    intuit_tid: input.log.intuitTid,
    http_status: input.log.httpStatus,
    method: input.log.method,
    endpoint: input.log.endpoint,
    realm_id: input.log.realmId,
    fault_type: input.log.faultType,
    errors: input.log.errors,
    intuit_time: input.log.intuitTime,
    shareable: input.log.shareable,
  });
  if (error) console.error("[qbo] error log was not stored", error.message);
}

export async function listQboErrorLogs(admin: SupabaseClient, organizationId: string) {
  const { data, error } = await admin
    .from("qbo_api_logs")
    .select("id, occurred_at, intuit_tid, http_status, method, endpoint, fault_type, shareable")
    .eq("organization_id", organizationId)
    .order("occurred_at", { ascending: false })
    .limit(15);
  if (error) {
    if (/qbo_api_logs|schema cache|does not exist|relation/i.test(error.message)) {
      console.warn("[qbo] Apply supabase/migrations/20261013200000_qbo_api_logs.sql to store shareable Intuit error logs.");
      return [];
    }
    throw new Error(error.message);
  }
  return (data || []).map((row) => ({
    id: String(row.id),
    occurredAt: String(row.occurred_at || ""),
    intuitTid: String(row.intuit_tid || ""),
    httpStatus: Number(row.http_status || 0),
    method: String(row.method || ""),
    endpoint: String(row.endpoint || ""),
    faultType: String(row.fault_type || ""),
    shareable: String(row.shareable || ""),
  }));
}

export async function storeQboError(admin: SupabaseClient, organizationId: string, error: unknown, connectionId?: string) {
  const log = qboLogOf(error);
  if (!log) return;
  await storeQboErrorLog(admin, { organizationId, connectionId, log });
}

export async function disconnectQbo(admin: SupabaseClient, organizationId: string) {
  const existing = await loadQboConnection(admin, organizationId);
  if (!existing) return;
  await admin.from("qbo_credentials").delete().eq("connection_id", existing.id);
  await updateQboConnection(admin, organizationId, {
    status: "disconnected",
    realm_id: null,
    company_name: "",
    next_run_at: null,
    last_error: "",
  });
}

export async function listSyncRuns(admin: SupabaseClient, organizationId: string) {
  const { data, error } = await admin
    .from("qbo_sync_runs")
    .select("id, trigger, status, started_at, finished_at, pulled, pushed, matched, review, error")
    .eq("organization_id", organizationId)
    .order("started_at", { ascending: false })
    .limit(8);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: String(row.id),
    trigger: String(row.trigger),
    status: String(row.status),
    startedAt: String(row.started_at || ""),
    finishedAt: String(row.finished_at || ""),
    pulled: Number(row.pulled || 0),
    pushed: Number(row.pushed || 0),
    matched: Number(row.matched || 0),
    review: Number(row.review || 0),
    error: String(row.error || ""),
  }));
}

export function publicQboStatus(connection: QboConnection | null, extra: {
  redirectUri: string;
  needsReview?: number;
  openItems?: unknown[];
  runs?: unknown[];
  logs?: unknown[];
}) {
  const status = connection?.status || "disconnected";
  const syncMode = connection?.syncMode || "manual";
  const nextRunAt = connection?.nextRunAt || null;
  return {
    configured: quickBooksConfigured(),
    environment: quickBooksEnvironment(),
    redirectUri: extra.redirectUri,
    status,
    companyName: connection?.companyName || "",
    syncMode,
    schedule: connection?.schedule || {},
    nextRunAt,
    lastSyncedAt: connection?.lastSyncedAt || null,
    lastError: connection?.lastError ? publicQboError(connection.lastError) : "",
    due: connection ? isSyncDue({ status, syncMode, nextRunAt }) : false,
    needsReview: extra.needsReview || 0,
    openItems: extra.openItems || [],
    runs: extra.runs || [],
    logs: extra.logs || [],
  };
}

function mapConnection(row: Record<string, any>, encryptedCredentials: string): QboConnection {
  const schedule = row.schedule && typeof row.schedule === "object" ? row.schedule as QboSchedule : {};
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    status: String(row.status || "disconnected") as QboConnection["status"],
    realmId: String(row.realm_id || ""),
    companyName: String(row.company_name || ""),
    syncMode: (row.sync_mode || "manual") as QboSyncMode,
    schedule,
    nextRunAt: row.next_run_at ? String(row.next_run_at) : null,
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
    lastError: String(row.last_error || ""),
    metadata,
    encryptedCredentials,
    connectedBy: String(row.connected_by || ""),
  };
}
