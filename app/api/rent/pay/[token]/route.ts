import { NextResponse } from "next/server";
import { getDemoChargeByToken, payDemoCharge } from "@/lib/rent-demo";
import { appOrigin, publicCharge, remainingCents, stripeConfigured } from "@/lib/rent";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getLiveChargeByToken, recordLivePayment } from "@/lib/rent-live";
import { getStripe, stripePublishableKey } from "@/lib/stripe";

function originOf(request: Request) {
  return appOrigin(request);
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const demo = getDemoChargeByToken(token);
  if (demo) {
    return NextResponse.json({
      mode: "demo",
      stripe: stripeConfigured(),
      publishableKey: stripePublishableKey(),
      charge: publicCharge(demo, originOf(request)),
    });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "This pay link is not valid." }, { status: 404 });
  const charge = await getLiveChargeByToken(admin, token);
  if (!charge) return NextResponse.json({ error: "This pay link is not valid." }, { status: 404 });
  return NextResponse.json({
    mode: "live",
    stripe: stripeConfigured(),
    publishableKey: stripePublishableKey(),
    charge: publicCharge(charge, originOf(request)),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const demo = getDemoChargeByToken(token);
  if (demo) {
    if (body.action === "intent") {
      const stripe = getStripe();
      if (!stripe) {
        return NextResponse.json({ mode: "demo", demoPay: true, charge: publicCharge(demo, originOf(request)) });
      }
      const remaining = remainingCents(demo);
      const intent = await stripe.paymentIntents.create({
        amount: remaining,
        currency: "usd",
        automatic_payment_methods: { enabled: true },
        metadata: { chargeId: demo.id, payToken: token, mode: "demo" },
      });
      return NextResponse.json({ mode: "demo", clientSecret: intent.client_secret, publishableKey: stripePublishableKey() });
    }
    const result = payDemoCharge(token, { method: body.method || "demo" });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ mode: "demo", charge: publicCharge(result.charge, originOf(request)), paid: true });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "This pay link is not valid." }, { status: 404 });
  const charge = await getLiveChargeByToken(admin, token);
  if (!charge) return NextResponse.json({ error: "This pay link is not valid." }, { status: 404 });
  if (body.action === "intent") {
    const stripe = getStripe();
    if (!stripe) return NextResponse.json({ error: "Stripe is not configured on this server." }, { status: 503 });
    const remaining = remainingCents(charge);
    if (remaining <= 0) return NextResponse.json({ error: "This charge is already paid." }, { status: 409 });
    const intent = await stripe.paymentIntents.create({
      amount: remaining,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: { chargeId: charge.id, organizationCharge: "rent", payToken: token },
    });
    await admin.from("rent_charges").update({
      stripe_payment_intent_id: intent.id,
      status: "processing",
      updated_at: new Date().toISOString(),
    }).eq("id", charge.id);
    return NextResponse.json({ mode: "live", clientSecret: intent.client_secret, publishableKey: stripePublishableKey() });
  }
  return NextResponse.json({ error: "Use Stripe to pay this charge, or ask the manager to record cash." }, { status: 400 });
}
