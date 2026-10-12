import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSyncDue, type QboSyncMode } from "@/lib/qbo/schedule";
import { runQboSync } from "@/lib/qbo/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runCron(request);
}

export async function POST(request: Request) {
  return runCron(request);
}

async function runCron(request: Request) {
  const secret = process.env.QBO_CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Set QBO_CRON_SECRET before scheduling QuickBooks sync." }, { status: 503 });
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const left = Buffer.from(token);
  const right = Buffer.from(secret);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Supabase service role is required." }, { status: 400 });
  const { data, error } = await admin
    .from("accounting_connections")
    .select("organization_id, status, sync_mode, next_run_at")
    .eq("provider", "quickbooks_online")
    .eq("status", "connected")
    .neq("sync_mode", "manual")
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const due = (data || []).filter((row) => isSyncDue({
    status: String(row.status),
    syncMode: String(row.sync_mode),
    nextRunAt: row.next_run_at ? String(row.next_run_at) : null,
  })).slice(0, 5);
  const results = [];
  for (const row of due) {
    const mode = String(row.sync_mode) as QboSyncMode;
    const result = await runQboSync(admin, String(row.organization_id), mode);
    results.push({
      organizationId: String(row.organization_id),
      ok: result.ok,
      skipped: Boolean(result.skipped),
      pulled: result.pulled,
      pushed: result.pushed,
      error: result.error || result.errors[0] || "",
    });
  }
  return NextResponse.json({ ran: results.length, results });
}
