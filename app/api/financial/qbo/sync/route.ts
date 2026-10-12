import { NextResponse } from "next/server";
import { loadQboConnection, requireBooksManager } from "@/lib/qbo/connection";
import { isSyncDue } from "@/lib/qbo/schedule";
import { runQboSync } from "@/lib/qbo/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const auth = await requireBooksManager();
  if (!auth.ok) return auth.response;
  try {
    const connection = await loadQboConnection(auth.admin, auth.organizationId);
    const trigger = connection && isSyncDue({
      status: connection.status,
      syncMode: connection.syncMode,
      nextRunAt: connection.nextRunAt,
    }) ? connection.syncMode : "manual";
    const result = await runQboSync(auth.admin, auth.organizationId, trigger);
    if (result.skipped) return NextResponse.json({ error: "A QuickBooks sync is already running." }, { status: 409 });
    if (!result.ok) return NextResponse.json({ error: result.error || result.errors[0] || "QuickBooks sync failed.", result }, { status: 502 });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "QuickBooks sync failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
