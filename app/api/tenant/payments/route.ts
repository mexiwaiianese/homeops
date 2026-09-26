import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { appOrigin, publicCharge, remainingCents } from "@/lib/rent";
import { payDemoCharge } from "@/lib/rent-demo";
import { getStripe, stripePublishableKey } from "@/lib/stripe";
import { getTenantContext } from "@/lib/tenant-auth";
import { ensureStripeCustomer, getTenantCharge, listTenantPaymentMethods, recordIntentOutcome } from "@/lib/tenant-billing";

// Tenant-initiated payments.
//   { chargeId, paymentMethodId }        -> charge a saved method server-side (one tap)
//   { chargeId }                          -> PaymentIntent for the Payment Element; saves the method for next time
//   { action: "confirm", paymentIntentId } -> record the outcome right away instead of waiting on the webhook
//   { action: "demo-pay", chargeId }       -> demo ledger only, when no Stripe keys exist

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Sign in to make a payment." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const origin = appOrigin(request);
  const stripe = getStripe();

  if (body.action === "confirm") {
    if (!stripe) return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
    const intentId = String(body.paymentIntentId || "");
    if (!intentId.startsWith("pi_")) return NextResponse.json({ error: "Missing payment intent." }, { status: 400 });
    const intent = await stripe.paymentIntents.retrieve(intentId, { expand: ["payment_method"] });
    const chargeId = intent.metadata?.chargeId;
    const charge = chargeId ? await getTenantCharge(context, chargeId) : null;
    if (!charge || intent.metadata?.tenantId !== context.tenant.id) return NextResponse.json({ error: "Payment does not belong to this account." }, { status: 404 });
    const outcome = await recordIntentOutcome(context, charge, intent);
    const refreshed = await getTenantCharge(context, charge.id);
    return NextResponse.json({ ...outcome, charge: refreshed ? publicCharge(refreshed, origin) : null });
  }

  const charge = await getTenantCharge(context, String(body.chargeId || ""));
  if (!charge) return NextResponse.json({ error: "That charge is not on your account." }, { status: 404 });
  if (charge.status === "void") return NextResponse.json({ error: "This charge was voided." }, { status: 409 });
  const amount = remainingCents(charge);
  if (amount <= 0) return NextResponse.json({ error: "This charge is already paid." }, { status: 409 });

  if (!stripe) {
    if (context.mode !== "demo") return NextResponse.json({ error: "Online payments are not enabled yet. Contact your property manager." }, { status: 503 });
    const methods = await listTenantPaymentMethods(context);
    const chosen = methods.find((row) => row.id === body.paymentMethodId) || methods.find((row) => row.isDefault);
    const result = payDemoCharge(charge.payToken, { method: chosen?.type === "us_bank_account" ? "stripe_ach" : chosen ? "stripe_card" : "demo" });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ paid: true, mode: "demo", charge: publicCharge(result.charge, origin) });
  }

  const customerId = await ensureStripeCustomer(context);
  if (!customerId) return NextResponse.json({ error: "Could not set up your Stripe profile." }, { status: 500 });
  const metadata = {
    chargeId: charge.id,
    payToken: charge.payToken,
    tenantId: context.tenant.id,
    organizationCharge: "rent",
    source: "tenant_portal",
    mode: context.mode,
  };

  const paymentMethodId = typeof body.paymentMethodId === "string" ? body.paymentMethodId : null;
  if (paymentMethodId) {
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== customerId) return NextResponse.json({ error: "That payment method is not on your account." }, { status: 404 });
    let intent: Stripe.PaymentIntent;
    try {
      intent = await stripe.paymentIntents.create({
        amount,
        currency: "usd",
        customer: customerId,
        payment_method: paymentMethodId,
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        metadata,
      }, { idempotencyKey: `tenant-${charge.id}-${paymentMethodId}-${charge.paidCents}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Payment was declined.";
      return NextResponse.json({ error: message }, { status: 402 });
    }
    if (context.mode === "live") {
      await context.admin.from("rent_charges").update({ stripe_payment_intent_id: intent.id, updated_at: new Date().toISOString() }).eq("id", charge.id);
    }
    const outcome = await recordIntentOutcome(context, charge, intent);
    if (intent.status === "requires_action") {
      return NextResponse.json({ requiresAction: true, clientSecret: intent.client_secret, publishableKey: stripePublishableKey(), paymentIntentId: intent.id });
    }
    const refreshed = await getTenantCharge(context, charge.id);
    return NextResponse.json({
      paid: intent.status === "succeeded",
      processing: intent.status === "processing",
      ...outcome,
      charge: refreshed ? publicCharge(refreshed, origin) : null,
    });
  }

  const intent = await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    customer: customerId,
    setup_future_usage: body.save === false ? undefined : "off_session",
    automatic_payment_methods: { enabled: true },
    metadata,
  });
  if (context.mode === "live") {
    await context.admin.from("rent_charges").update({ stripe_payment_intent_id: intent.id, status: "processing", updated_at: new Date().toISOString() }).eq("id", charge.id);
  }
  return NextResponse.json({ clientSecret: intent.client_secret, publishableKey: stripePublishableKey(), paymentIntentId: intent.id });
}
