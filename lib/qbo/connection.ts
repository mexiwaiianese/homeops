import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { credentialsFromEncrypted, encryptCredentials, quickBooksConfigured, quickBooksEnvironment, type QboCredentials, type QboSession } from "@/lib/qbo/quickbooks";
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
  return mapConnection(data, String(secret?.encrypted_credentials || ""));
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
    realm_id: input.realmId,
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
  const { error: secretError } = await admin.from("qbo_credentials").upsert({
    connection_id: data.id,
    organization_id: input.organizationId,
    encrypted_credentials: encryptCredentials(input.credentials),
    updated_at: now,
  });
  if (secretError) throw new Error(secretError.message);
  return mapConnection(data, encryptCredentials(input.credentials));
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
  const { error } = await admin.from("qbo_credentials").upsert({
    connection_id: connection.id,
    organization_id: connection.organizationId,
    encrypted_credentials: encryptCredentials(credentials),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export function sessionFor(admin: SupabaseClient, connection: QboConnection): QboSession {
  if (!connection.encryptedCredentials) throw new Error("Connect QuickBooks first.");
  return {
    realmId: connection.realmId,
    credentials: credentialsFromEncrypted(connection.encryptedCredentials),
    persist: (next) => persistQboCredentials(admin, connection, next),
  };
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
    realmId: connection?.realmId || "",
    syncMode,
    schedule: connection?.schedule || {},
    nextRunAt,
    lastSyncedAt: connection?.lastSyncedAt || null,
    lastError: connection?.lastError || "",
    due: connection ? isSyncDue({ status, syncMode, nextRunAt }) : false,
    needsReview: extra.needsReview || 0,
    openItems: extra.openItems || [],
    runs: extra.runs || [],
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
