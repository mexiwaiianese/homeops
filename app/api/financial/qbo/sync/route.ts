import { NextResponse } from "next/server";
import { loadQboConnection, requireBooksManager } from "@/lib/qbo/connection";
import { isSyncDue } from "@/lib/qbo/schedule";
import { publicQboError } from "@/lib/qbo/quickbooks";
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
    const summary = { pulled: result.pulled, pushed: result.pushed, matched: result.matched, review: result.review };
    if (result.skipped) return NextResponse.json({ error: "A QuickBooks sync is already running." }, { status: 409 });
    if (!result.ok) return NextResponse.json({ error: publicQboError(result.error || result.errors[0] || "QuickBooks sync failed."), result: summary }, { status: 502 });
    return NextResponse.json({ ok: true, result: summary });
  } catch (error) {
    return NextResponse.json({ error: publicQboError(error) }, { status: 500 });
  }
}
