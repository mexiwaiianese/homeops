import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { recordDemoOwnerMove } from "@/lib/books-demo";
import { recordLiveOwnerMove } from "@/lib/books-live";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const amountCents = Math.round(Number(body.amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) return NextResponse.json({ error: "Enter an amount." }, { status: 400 });
  const kind = body.kind === "owner_contribution" ? "owner_contribution" : "owner_disbursement";
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase) {
    const result = recordDemoOwnerMove({
      ownerId: String(body.ownerId || ""),
      homeId: body.homeId || null,
      kind,
      amountCents,
      notes: body.notes,
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ mode: "demo", ...result }, { status: 201 });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const result = await recordLiveOwnerMove(supabase, organizationId, {
      ownerId: String(body.ownerId || ""),
      homeId: body.homeId || null,
      kind,
      amountCents,
      notes: body.notes,
    });
    return NextResponse.json({ mode: "live", ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not record owner cash" }, { status: 400 });
  }
}
