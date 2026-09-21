import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { recordDemoOffline } from "@/lib/rent-demo";
import { appOrigin, publicCharge } from "@/lib/rent";
import { recordLivePayment } from "@/lib/rent-live";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const origin = appOrigin(request);
  const body = await request.json().catch(() => ({}));
  const method = body.method === "check" || body.method === "other" ? body.method : "cash";
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase) {
    const result = recordDemoOffline(id, {
      method,
      amountCents: body.amount != null ? Math.round(Number(body.amount) * 100) : undefined,
      notes: body.notes,
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ mode: "demo", charge: publicCharge(result.charge, origin), payment: result.payment });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const amountCents = body.amount != null ? Math.round(Number(body.amount) * 100) : null;
  const { data: charge } = await supabase.from("rent_charges").select("amount_cents, paid_cents").eq("id", id).eq("organization_id", organizationId).maybeSingle();
  if (!charge) return NextResponse.json({ error: "Charge not found" }, { status: 404 });
  const remaining = Math.max(0, charge.amount_cents - charge.paid_cents);
  const mapped = await recordLivePayment(supabase, organizationId, id, {
    amountCents: amountCents && amountCents > 0 ? Math.min(remaining, amountCents) : remaining,
    method,
    status: "succeeded",
  });
  return NextResponse.json({ mode: "live", charge: publicCharge(mapped, origin) });
}
