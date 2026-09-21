import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { BILL_KINDS, isBookKind, type BookKind } from "@/lib/books";
import { createDemoBill, listDemoBills } from "@/lib/books-demo";
import { createLiveBill, listLiveBills, payLiveBill } from "@/lib/books-live";
import { currentRentPeriod } from "@/lib/rent";

export async function GET() {
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase) return NextResponse.json({ mode: "demo", bills: listDemoBills() });
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  return NextResponse.json({ mode: "live", bills: await listLiveBills(supabase, organizationId) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const amountCents = Math.round(Number(body.amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) return NextResponse.json({ error: "Enter an amount." }, { status: 400 });
  if (!String(body.vendorName || "").trim()) return NextResponse.json({ error: "Vendor is required." }, { status: 400 });
  const requested = String(body.kind || "repairs");
  const kind: BookKind = isBookKind(requested) && BILL_KINDS.includes(requested as BookKind) ? requested : "repairs";
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase) {
    const result = createDemoBill({
      homeId: body.homeId || null,
      vendorName: String(body.vendorName || "").trim(),
      vendorId: body.vendorId || null,
      kind,
      amountCents,
      dueOn: body.dueOn,
      description: body.description,
      payNow: Boolean(body.payNow),
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ mode: "demo", ...result }, { status: 201 });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const result = await createLiveBill(supabase, organizationId, {
      homeId: body.homeId || null,
      vendorName: String(body.vendorName).trim(),
      vendorId: body.vendorId || null,
      kind,
      amountCents,
      dueOn: body.dueOn || currentRentPeriod().periodEnd,
      description: body.description,
      payNow: Boolean(body.payNow),
    });
    return NextResponse.json({ mode: "live", ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save bill" }, { status: 400 });
  }
}
