import { NextResponse } from "next/server";
import { getStripe, stripePublishableKey } from "@/lib/stripe";
import { getDemoPayout, setDemoPayout } from "@/lib/vendor-portal-demo";
import { requireVendorActor } from "@/lib/vendor-session";

async function stripeBank(customerId: string | null) {
  const stripe = getStripe();
  if (!stripe || !customerId) return null;
  const methods = await stripe.paymentMethods.list({ customer: customerId, type: "us_bank_account", limit: 5 });
  const bank = methods.data.find((row) => row.us_bank_account) || methods.data[0];
  if (!bank?.us_bank_account) return null;
  const verified = (bank.us_bank_account as { status?: string }).status;
  return {
    bankName: bank.us_bank_account.bank_name || "Bank account",
    last4: bank.us_bank_account.last4 || null,
    status: verified && verified !== "verified" ? "pending" as const : "confirmed" as const,
    stripePaymentMethodId: bank.id,
  };
}

export async function GET() {
  const actor = await requireVendorActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const stripe = Boolean(getStripe() && stripePublishableKey());
  if (actor.mode === "demo") {
    return NextResponse.json({
      mode: "demo",
      stripe,
      publishableKey: stripePublishableKey(),
      bank: getDemoPayout(actor.vendorId),
    });
  }
  const { data: vendor } = await actor.admin.from("vendors").select("stripe_customer_id").eq("id", actor.vendorId).maybeSingle();
  const bank = await stripeBank(vendor?.stripe_customer_id || null).catch(() => null);
  return NextResponse.json({
    mode: "live",
    stripe,
    publishableKey: stripePublishableKey(),
    bank: bank || { bankName: null, last4: null, status: "missing", stripePaymentMethodId: null },
  });
}

export async function POST(request: Request) {
  const actor = await requireVendorActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = await request.json().catch(() => ({}));
  const stripe = getStripe();
  const publishableKey = stripePublishableKey();

  if (body.action === "setup" && stripe && publishableKey) {
    let customerId: string | null = null;
    if (actor.mode === "demo") customerId = getDemoPayout(actor.vendorId).stripeCustomerId;
    else {
      const { data } = await actor.admin.from("vendors").select("name, email, stripe_customer_id").eq("id", actor.vendorId).maybeSingle();
      customerId = data?.stripe_customer_id || null;
      if (!customerId) {
        const customer = await stripe.customers.create({
          name: data?.name || undefined,
          email: data?.email || undefined,
          metadata: { vendorId: actor.vendorId, source: "homeops_vendor_payout" },
        });
        customerId = customer.id;
        await actor.admin.from("vendors").update({ stripe_customer_id: customerId }).eq("id", actor.vendorId);
      }
    }
    if (actor.mode === "demo" && !customerId) {
      const customer = await stripe.customers.create({
        name: actor.vendorId,
        metadata: { vendorId: actor.vendorId, source: "homeops_vendor_payout_demo" },
      });
      customerId = customer.id;
      setDemoPayout(actor.vendorId, { stripeCustomerId: customerId });
    }
    const intent = await stripe.setupIntents.create({
      customer: customerId!,
      payment_method_types: ["us_bank_account"],
      payment_method_options: { us_bank_account: { verification_method: "automatic" } },
      metadata: { vendorId: actor.vendorId, source: "homeops_vendor_payout" },
    });
    return NextResponse.json({ clientSecret: intent.client_secret, publishableKey });
  }

  if (body.action === "confirm" && body.paymentMethodId && stripe) {
    const method = await stripe.paymentMethods.retrieve(String(body.paymentMethodId));
    const bank = method.us_bank_account;
    if (!bank) return NextResponse.json({ error: "The payment processor did not return a bank account." }, { status: 400 });
    if (actor.mode === "demo") {
      const saved = setDemoPayout(actor.vendorId, {
        bankName: bank.bank_name || "Bank account",
        last4: bank.last4 || null,
        status: "confirmed",
        confirmedAt: new Date().toISOString(),
        stripePaymentMethodId: method.id,
      });
      return NextResponse.json({ mode: "demo", bank: saved });
    }
    return NextResponse.json({
      mode: "live",
      bank: { bankName: bank.bank_name || "Bank account", last4: bank.last4, status: "confirmed", stripePaymentMethodId: method.id },
    });
  }

  if (actor.mode !== "demo") {
    return NextResponse.json({ error: stripe ? "Start a bank setup with the payment processor to change the payout account." : "The payment processor is not configured on this server." }, { status: 400 });
  }

  if (body.action === "replace") {
    return NextResponse.json({ mode: "demo", bank: setDemoPayout(actor.vendorId, { bankName: null, last4: null, status: "missing", confirmedAt: null, stripePaymentMethodId: null }) });
  }

  const bankName = String(body.bankName || "").trim();
  const last4 = String(body.last4 || "").replace(/\D/g, "");
  if (bankName.length < 2) return NextResponse.json({ error: "Enter the bank name." }, { status: 400 });
  if (!/^\d{4}$/.test(last4)) return NextResponse.json({ error: "Enter the last 4 digits of the account." }, { status: 400 });
  const saved = setDemoPayout(actor.vendorId, {
    bankName,
    last4,
    status: "confirmed",
    confirmedAt: new Date().toISOString(),
  });
  return NextResponse.json({
    mode: "demo",
    bank: saved,
    notice: stripe ? undefined : "Payment processor keys are not on this server, so this confirmation is stored for the demo only. No full account number was saved.",
  });
}
