import { NextResponse } from "next/server";
import { disconnectQbo, listSyncRuns, loadQboConnection, publicQboStatus, requireBooksManager, updateQboConnection } from "@/lib/qbo/connection";
import { appOrigin, quickBooksRedirectUri } from "@/lib/qbo/quickbooks";
import { normalizeSettings } from "@/lib/qbo/schedule";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireBooksManager();
  if (!auth.ok) return auth.response;
  try {
    const connection = await loadQboConnection(auth.admin, auth.organizationId);
    const [runs, counts] = await Promise.all([
      listSyncRuns(auth.admin, auth.organizationId),
      openCounts(auth.admin, auth.organizationId),
    ]);
    return NextResponse.json(publicQboStatus(connection, {
      redirectUri: quickBooksRedirectUri(appOrigin(request)),
      runs,
      ...counts,
    }));
  } catch (error) {
    return NextResponse.json({ error: setupMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireBooksManager();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  const settings = normalizeSettings(body);
  if ("error" in settings) return NextResponse.json({ error: settings.error }, { status: 400 });
  try {
    const connection = await loadQboConnection(auth.admin, auth.organizationId);
    if (!connection || connection.status === "disconnected") {
      return NextResponse.json({ error: "Connect QuickBooks before choosing a sync schedule." }, { status: 400 });
    }
    await updateQboConnection(auth.admin, auth.organizationId, {
      sync_mode: settings.syncMode,
      schedule: settings.schedule,
      next_run_at: settings.nextRunAt,
      last_error: "",
    });
    const saved = await loadQboConnection(auth.admin, auth.organizationId);
    const [runs, counts] = await Promise.all([
      listSyncRuns(auth.admin, auth.organizationId),
      openCounts(auth.admin, auth.organizationId),
    ]);
    return NextResponse.json(publicQboStatus(saved, {
      redirectUri: quickBooksRedirectUri(appOrigin(request)),
      runs,
      ...counts,
    }));
  } catch (error) {
    return NextResponse.json({ error: setupMessage(error) }, { status: 500 });
  }
}

export async function DELETE() {
  const auth = await requireBooksManager();
  if (!auth.ok) return auth.response;
  try {
    await disconnectQbo(auth.admin, auth.organizationId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: setupMessage(error) }, { status: 500 });
  }
}

async function openCounts(admin: Parameters<typeof loadQboConnection>[0], organizationId: string) {
  const review = await admin
    .from("financial_transactions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("source", "quickbooks_online")
    .eq("qbo_cash", true)
    .eq("allocation_status", "review");
  const open = await admin
    .from("financial_transactions")
    .select("id, tx_date, vendor_name, description, amount_cents, flow_type, account_name, raw_data")
    .eq("organization_id", organizationId)
    .eq("source", "quickbooks_online")
    .eq("qbo_cash", false)
    .order("tx_date", { ascending: false })
    .limit(20);
  if (review.error) throw new Error(review.error.message);
  if (open.error) throw new Error(open.error.message);
  const openItems = (open.data || [])
    .filter((row) => Number(row.raw_data?.qbo?.balanceCents ?? 1) > 0)
    .slice(0, 12)
    .map((row) => ({
      id: String(row.id),
      txDate: String(row.tx_date || ""),
      name: String(row.vendor_name || row.description || "QuickBooks"),
      amountCents: Number(row.amount_cents || 0),
      flowType: String(row.flow_type || "expense"),
      accountName: String(row.account_name || ""),
    }));
  return { needsReview: review.count || 0, openItems };
}

function setupMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "QuickBooks could not be loaded.";
  if (/qbo_|accounting_connections|schema cache|column/i.test(message)) {
    return "Apply supabase/migrations/20261012180000_qbo_sync.sql, then refresh Books.";
  }
  return message;
}
