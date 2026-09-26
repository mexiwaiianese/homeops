import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { livePaymentExists, recordLivePayment } from "@/lib/rent-live";
import { getDemoCharge, payDemoCharge } from "@/lib/rent-demo";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: "Stripe webhooks are not configured." }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  const raw = await request.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid signature" }, { status: 400 });
  }

  if (event.type !== "payment_intent.succeeded" && event.type !== "payment_intent.payment_failed") {
    return NextResponse.json({ received: true, ignored: event.type });
  }
  const intent = event.data.object as { id: string; amount: number; payment_method_types?: string[]; metadata?: Record<string, string>; latest_charge?: string };
  const chargeId = intent.metadata?.chargeId;
  if (!chargeId) return NextResponse.json({ received: true, unmatched: true });

  const demo = getDemoCharge(chargeId);
  if (demo && event.type === "payment_intent.succeeded") {
    payDemoCharge(demo.payToken, {
      method: intent.payment_method_types?.includes("us_bank_account") ? "stripe_ach" : "stripe_card",
      stripePaymentIntentId: intent.id,
    });
    return NextResponse.json({ received: true, mode: "demo" });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ received: true, stored: false });
  const { data: charge } = await admin.from("rent_charges").select("id, organization_id").eq("id", chargeId).maybeSingle();
  if (!charge) return NextResponse.json({ received: true, unmatched: true });
  const resultStatus = event.type === "payment_intent.succeeded" ? "succeeded" : "failed";
  if (await livePaymentExists(admin, intent.id, resultStatus)) return NextResponse.json({ received: true, mode: "live", duplicate: true });
  await recordLivePayment(admin, charge.organization_id, charge.id, {
    amountCents: intent.amount,
    method: intent.payment_method_types?.includes("us_bank_account") ? "stripe_ach" : "stripe_card",
    status: event.type === "payment_intent.succeeded" ? "succeeded" : "failed",
    stripePaymentIntentId: intent.id,
    stripeChargeId: typeof intent.latest_charge === "string" ? intent.latest_charge : null,
    failureReason: event.type === "payment_intent.payment_failed" ? "Stripe reported a failed payment." : null,
  });
  return NextResponse.json({ received: true, mode: "live" });
}
