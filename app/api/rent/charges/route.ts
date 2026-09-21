import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { createDemoCharge, listDemoCharges } from "@/lib/rent-demo";
import { appOrigin, currentRentPeriod, publicCharge } from "@/lib/rent";
import { generateLivePeriodCharges, listLiveCharges } from "@/lib/rent-live";
import { homes, tenants } from "@/lib/data";

export async function GET(request: Request) {
  const origin = appOrigin(request);
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase) {
    const charges = listDemoCharges().map((row) => publicCharge(row, origin));
    const due = charges.filter((row) => row.status === "due" || row.status === "failed" || row.status === "partial" || row.status === "processing");
    return NextResponse.json({
      mode: "demo",
      stripe: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
      period: currentRentPeriod(),
      summary: {
        dueCents: due.reduce((sum, row) => sum + row.remainingCents, 0),
        paidCents: charges.filter((row) => row.status === "paid").reduce((sum, row) => sum + row.amountCents, 0),
        dueCount: due.length,
        paidCount: charges.filter((row) => row.status === "paid").length,
      },
      charges,
      tenants: tenants.map((row) => ({ id: row.id, name: row.name, home: row.home })),
      homes: homes.map((row) => ({ id: row.id, address: row.address, tenantId: row.tenantId, rent: row.rent })),
    });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const charges = (await listLiveCharges(supabase, organizationId)).map((row) => publicCharge(row, origin));
  const due = charges.filter((row) => row.status === "due" || row.status === "failed" || row.status === "partial" || row.status === "processing");
  const [{ data: tenantRows }, { data: homeRows }] = await Promise.all([
    supabase.from("tenants").select("id, full_name").eq("organization_id", organizationId),
    supabase.from("homes").select("id, address1, monthly_rent_cents").eq("organization_id", organizationId),
  ]);
  return NextResponse.json({
    mode: "live",
    stripe: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY && process.env.STRIPE_SECRET_KEY),
    period: currentRentPeriod(),
    summary: {
      dueCents: due.reduce((sum, row) => sum + row.remainingCents, 0),
      paidCents: charges.filter((row) => row.status === "paid").reduce((sum, row) => sum + row.amountCents, 0),
      dueCount: due.length,
      paidCount: charges.filter((row) => row.status === "paid").length,
    },
    charges,
    tenants: (tenantRows ?? []).map((row) => ({ id: row.id, name: row.full_name })),
    homes: (homeRows ?? []).map((row) => ({ id: row.id, address: row.address1, rent: (row.monthly_rent_cents || 0) / 100 })),
  });
}

export async function POST(request: Request) {
  const origin = appOrigin(request);
  const body = await request.json().catch(() => ({}));
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase) {
    if (body.generate) {
      return NextResponse.json({ mode: "demo", charges: listDemoCharges().map((row) => publicCharge(row, origin)), message: "Demo charges are already generated for this month." });
    }
    const amountCents = Math.round(Number(body.amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) return NextResponse.json({ error: "Enter an amount." }, { status: 400 });
    const result = createDemoCharge({
      homeId: String(body.homeId || ""),
      tenantId: String(body.tenantId || ""),
      kind: body.kind,
      amountCents,
      dueOn: body.dueOn,
      notes: body.notes,
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ mode: "demo", charge: publicCharge(result.charge, origin) }, { status: 201 });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (body.generate) {
    const created = await generateLivePeriodCharges(supabase, organizationId);
    return NextResponse.json({ mode: "live", created: created.length, charges: created.map((row) => publicCharge(row, origin)) });
  }
  const amountCents = Math.round(Number(body.amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) return NextResponse.json({ error: "Enter an amount." }, { status: 400 });
  const period = currentRentPeriod();
  const { data, error } = await supabase.from("rent_charges").insert({
    organization_id: organizationId,
    home_id: body.homeId,
    lease_id: body.leaseId || null,
    tenant_id: body.tenantId,
    kind: body.kind || "other",
    period_start: body.periodStart || period.periodStart,
    period_end: body.periodEnd || period.periodEnd,
    due_on: body.dueOn || period.dueOn,
    amount_cents: amountCents,
    notes: body.notes || null,
  }).select("*, tenants(full_name), homes(address1), rent_payments(*)").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { mapCharge } = await import("@/lib/rent-live");
  return NextResponse.json({ mode: "live", charge: publicCharge(mapCharge(data), origin) }, { status: 201 });
}
