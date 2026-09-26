import { NextResponse } from "next/server";
import { stripePublishableKey } from "@/lib/stripe";
import { getTenantContext } from "@/lib/tenant-auth";
import { addDemoMethod, createSetupIntent, listTenantPaymentMethods, removePaymentMethod, setDefaultPaymentMethod, stripeReady } from "@/lib/tenant-billing";

// Payment methods live in Stripe. This route only brokers list / setup / default / detach.

export async function GET() {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const methods = await listTenantPaymentMethods(context).catch((error: Error) => ({ error: error.message }));
  if (!Array.isArray(methods)) return NextResponse.json({ error: methods.error }, { status: 500 });
  return NextResponse.json({ stripe: stripeReady(), publishableKey: stripeReady() ? stripePublishableKey() : null, paymentMethods: methods });
}

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => ({}));

  if (body.action === "setup") {
    if (!stripeReady()) return NextResponse.json({ error: "Stripe is not configured on this server.", demo: context.mode === "demo" }, { status: 503 });
    const clientSecret = await createSetupIntent(context);
    if (!clientSecret) return NextResponse.json({ error: "Could not start Stripe setup." }, { status: 500 });
    return NextResponse.json({ clientSecret, publishableKey: stripePublishableKey() });
  }
  if (body.action === "default") {
    const result = await setDefaultPaymentMethod(context, String(body.paymentMethodId || ""));
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, paymentMethods: await listTenantPaymentMethods(context) });
  }
  if (body.action === "add-demo") {
    const type = body.type === "card" ? "card" : "us_bank_account";
    const result = addDemoMethod(context, { type, last4: body.last4, brand: body.brand, bankName: body.bankName });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, method: result.method, paymentMethods: await listTenantPaymentMethods(context) });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export async function DELETE(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const result = await removePaymentMethod(context, String(body.paymentMethodId || ""));
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, paymentMethods: await listTenantPaymentMethods(context) });
}
