import { NextResponse } from "next/server";
import { lookupVendorPromo, pricedMonthlyCents, vendorMonthlyCents } from "@/lib/vendor-plans";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const raw = String(body.code || "").trim();
  if (!raw) return NextResponse.json({ error: "Enter a promo code." }, { status: 400 });
  const promo = lookupVendorPromo(raw);
  if (!promo) return NextResponse.json({ error: "That promo code is not active." }, { status: 400 });
  const payments = Boolean(body.payments);
  return NextResponse.json({
    promo,
    listCents: vendorMonthlyCents(payments),
    monthlyCents: pricedMonthlyCents(payments, promo),
  });
}
