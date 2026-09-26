import { NextResponse } from "next/server";
import { listDemoReceivables, receivableTotals } from "@/lib/vendor-portal-demo";
import { missingPortalTable, requireVendorActor } from "@/lib/vendor-session";

export async function GET() {
  const actor = await requireVendorActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (actor.mode === "demo") {
    const rows = listDemoReceivables(actor.vendorId);
    return NextResponse.json({ mode: "demo", receivables: rows, totals: receivableTotals(rows) });
  }
  const { data, error } = await actor.admin
    .from("vendor_receivables")
    .select("*")
    .eq("vendor_id", actor.vendorId)
    .order("due_on", { ascending: true });
  if (error) return NextResponse.json({ error: missingPortalTable(error.message) ? "Apply migration 20260926120000_vendor_portal_controls.sql." : error.message }, { status: 400 });
  const receivables = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    propertyLabel: row.property_label,
    amountCents: row.amount_cents,
    status: row.status,
    dueOn: row.due_on,
    note: row.note,
  }));
  const sum = (status: string) => receivables.filter((row) => row.status === status).reduce((total, row) => total + row.amountCents, 0);
  return NextResponse.json({
    mode: "live",
    receivables,
    totals: { upcomingCents: sum("upcoming"), invoicedCents: sum("invoiced"), overdueCents: sum("overdue"), paidCents: sum("paid") },
  });
}
