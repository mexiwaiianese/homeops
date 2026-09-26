import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { publicCharge, remainingCents, type RentCharge, type RentPayment } from "@/lib/rent";
import { demoPaymentExists, getDemoCharge, listDemoCharges, payDemoCharge } from "@/lib/rent-demo";
import { listLiveChargesForTenant, livePaymentExists, recordLivePayment } from "@/lib/rent-live";
import { describePaymentMethod, type TenantPaymentMethod } from "@/lib/tenant-portal";
import {
  addDemoPaymentMethod,
  getDemoStripeCustomer,
  listDemoPaymentMethods,
  removeDemoPaymentMethod,
  setDemoDefaultPaymentMethod,
  setDemoStripeCustomer,
} from "@/lib/tenant-demo";
import type { TenantContext } from "@/lib/tenant-auth";

type Ctx = NonNullable<TenantContext>;

// Stripe is the vault for payment methods. HomeOps stores only the customer id and the
// resulting payment ledger. Without Stripe keys the demo store fakes saved methods so the
// portal can still be walked end to end.

export function stripeReady() {
  return Boolean(getStripe());
}

export async function ensureStripeCustomer(ctx: Ctx): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  if (ctx.mode === "demo") {
    const existing = getDemoStripeCustomer(ctx.tenant.id);
    if (existing) return existing;
    const customer = await stripe.customers.create({
      name: ctx.tenant.name,
      email: ctx.tenant.email || undefined,
      phone: ctx.tenant.phone || undefined,
      metadata: { tenantId: ctx.tenant.id, mode: "demo", source: "homeops_tenant_portal" },
    });
    setDemoStripeCustomer(ctx.tenant.id, customer.id);
    return customer.id;
  }
  const { data } = await ctx.admin.from("tenants").select("stripe_customer_id").eq("id", ctx.tenant.id).maybeSingle();
  if (data?.stripe_customer_id) return data.stripe_customer_id;
  const customer = await stripe.customers.create({
    name: ctx.tenant.name,
    email: ctx.tenant.email || undefined,
    phone: ctx.tenant.phone || undefined,
    metadata: { tenantId: ctx.tenant.id, organizationId: ctx.organizationId, source: "homeops_tenant_portal" },
  });
  await ctx.admin.from("tenants").update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() }).eq("id", ctx.tenant.id);
  return customer.id;
}

function mapStripeMethod(pm: Stripe.PaymentMethod, defaultId: string | null): TenantPaymentMethod | null {
  if (pm.type === "card" && pm.card) {
    const base = { type: "card" as const, brand: pm.card.brand, bankName: null, last4: pm.card.last4 };
    return { id: pm.id, ...base, label: describePaymentMethod(base), expMonth: pm.card.exp_month, expYear: pm.card.exp_year, isDefault: pm.id === defaultId };
  }
  if (pm.type === "us_bank_account" && pm.us_bank_account) {
    const base = { type: "us_bank_account" as const, brand: null, bankName: pm.us_bank_account.bank_name, last4: pm.us_bank_account.last4 || "" };
    return { id: pm.id, ...base, label: describePaymentMethod(base), expMonth: null, expYear: null, isDefault: pm.id === defaultId };
  }
  return null;
}

async function stripeDefaultMethodId(stripe: Stripe, customerId: string) {
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return null;
  const value = customer.invoice_settings?.default_payment_method;
  return typeof value === "string" ? value : value?.id ?? null;
}

export async function listTenantPaymentMethods(ctx: Ctx): Promise<TenantPaymentMethod[]> {
  const stripe = getStripe();
  if (!stripe) return ctx.mode === "demo" ? listDemoPaymentMethods(ctx.tenant.id) : [];
  const customerId = await ensureStripeCustomer(ctx);
  if (!customerId) return [];
  const [defaultId, list] = await Promise.all([
    stripeDefaultMethodId(stripe, customerId),
    stripe.customers.listPaymentMethods(customerId, { limit: 20 }),
  ]);
  const rows = list.data.map((pm) => mapStripeMethod(pm, defaultId)).filter((row): row is TenantPaymentMethod => Boolean(row));
  if (rows.length && !rows.some((row) => row.isDefault)) {
    // Stripe does not auto-pick a default. Promote the newest one so one-tap pay works.
    await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: rows[0].id } });
    rows[0].isDefault = true;
  }
  return rows;
}

export async function createSetupIntent(ctx: Ctx) {
  const stripe = getStripe();
  if (!stripe) return null;
  const customerId = await ensureStripeCustomer(ctx);
  if (!customerId) return null;
  const intent = await stripe.setupIntents.create({
    customer: customerId,
    usage: "off_session",
    automatic_payment_methods: { enabled: true },
    metadata: { tenantId: ctx.tenant.id, source: "homeops_tenant_portal" },
  });
  return intent.client_secret;
}

export async function setDefaultPaymentMethod(ctx: Ctx, methodId: string) {
  const stripe = getStripe();
  if (!stripe) {
    if (ctx.mode !== "demo") return { error: "Stripe is not configured on this server." };
    return setDemoDefaultPaymentMethod(ctx.tenant.id, methodId);
  }
  const customerId = await ensureStripeCustomer(ctx);
  if (!customerId) return { error: "Stripe customer is unavailable." };
  const pm = await stripe.paymentMethods.retrieve(methodId);
  if (pm.customer !== customerId) return { error: "Payment method not found." };
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: methodId } });
  return { ok: true as const };
}

export async function removePaymentMethod(ctx: Ctx, methodId: string) {
  const stripe = getStripe();
  if (!stripe) {
    if (ctx.mode !== "demo") return { error: "Stripe is not configured on this server." };
    return removeDemoPaymentMethod(ctx.tenant.id, methodId);
  }
  const customerId = await ensureStripeCustomer(ctx);
  if (!customerId) return { error: "Stripe customer is unavailable." };
  const pm = await stripe.paymentMethods.retrieve(methodId);
  if (pm.customer !== customerId) return { error: "Payment method not found." };
  await stripe.paymentMethods.detach(methodId);
  return { ok: true as const };
}

export function addDemoMethod(ctx: Ctx, input: { type: "card" | "us_bank_account"; last4?: string; brand?: string; bankName?: string }) {
  if (ctx.mode !== "demo" || getStripe()) return { error: "Add payment methods through Stripe on this server." };
  return { method: addDemoPaymentMethod(ctx.tenant.id, input) };
}

export async function listTenantCharges(ctx: Ctx, origin: string) {
  const rows: RentCharge[] = ctx.mode === "demo"
    ? listDemoCharges().filter((row) => row.tenantId === ctx.tenant.id)
    : await listLiveChargesForTenant(ctx.admin, ctx.tenant.id);
  return rows
    .sort((a, b) => b.dueOn.localeCompare(a.dueOn))
    .map((row) => publicCharge(row, origin));
}

export async function getTenantCharge(ctx: Ctx, chargeId: string): Promise<RentCharge | null> {
  if (ctx.mode === "demo") {
    const row = getDemoCharge(chargeId);
    return row && row.tenantId === ctx.tenant.id ? row : null;
  }
  const rows = await listLiveChargesForTenant(ctx.admin, ctx.tenant.id);
  return rows.find((row) => row.id === chargeId) || null;
}

function methodFromIntent(intent: Stripe.PaymentIntent): RentPayment["method"] {
  const pm = intent.payment_method;
  const type = typeof pm === "object" && pm ? pm.type : intent.payment_method_types?.[0];
  return type === "us_bank_account" ? "stripe_ach" : "stripe_card";
}

/** Record a Stripe PaymentIntent outcome against a charge. Safe to call more than once per intent. */
export async function recordIntentOutcome(ctx: Ctx, charge: RentCharge, intent: Stripe.PaymentIntent) {
  const succeeded = intent.status === "succeeded";
  const processing = intent.status === "processing";
  if (!succeeded && !processing) return { recorded: false, status: intent.status };
  const method = methodFromIntent(intent);
  if (ctx.mode === "demo") {
    if (!succeeded) return { recorded: false, status: intent.status };
    if (demoPaymentExists(intent.id)) return { recorded: true, duplicate: true, status: intent.status };
    payDemoCharge(charge.payToken, { method, amountCents: intent.amount, stripePaymentIntentId: intent.id });
    return { recorded: true, status: intent.status };
  }
  const paymentStatus: RentPayment["status"] = succeeded ? "succeeded" : "pending";
  if (await livePaymentExists(ctx.admin, intent.id, paymentStatus)) return { recorded: true, duplicate: true, status: intent.status };
  await recordLivePayment(ctx.admin, ctx.organizationId, charge.id, {
    amountCents: intent.amount,
    method,
    status: paymentStatus,
    stripePaymentIntentId: intent.id,
    stripeChargeId: typeof intent.latest_charge === "string" ? intent.latest_charge : null,
  });
  return { recorded: true, status: intent.status };
}

export function payableAmount(charge: RentCharge) {
  return remainingCents(charge);
}
