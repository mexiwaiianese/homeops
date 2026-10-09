import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { quoteVendorSignup, type VendorSignupDraft } from "@/lib/vendor-billing-demo";
import { lookupVendorPromo, VENDOR_BASE_CENTS, VENDOR_PAYMENTS_ADDON_CENTS } from "@/lib/vendor-plans";

const BASE_LOOKUP = "portonos_vendor_desk_monthly";
const ADDON_LOOKUP = "portonos_vendor_payments_monthly";
/** SaaS for business use. Required so this account can sell the desk through Managed Payments. */
const SAAS_TAX_CODE = "txcd_10103001";

function missingResource(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "resource_missing");
}

async function ensureSaasTaxCode(stripe: Stripe, productId: string) {
  const product = await stripe.products.retrieve(productId);
  const code = typeof product.tax_code === "string" ? product.tax_code : product.tax_code?.id;
  if (code === SAAS_TAX_CODE) return;
  await stripe.products.update(productId, { tax_code: SAAS_TAX_CODE });
}

async function monthlyPrice(stripe: Stripe, lookupKey: string, name: string, unitAmount: number) {
  const matches = (row: Stripe.Price) => row.unit_amount === unitAmount && row.recurring?.interval === "month" && row.currency === "usd";
  const load = async () => {
    const listed = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    return listed.data.find(matches) || null;
  };
  let found = await load();
  if (!found) {
    try {
      found = await stripe.prices.create({
        currency: "usd",
        unit_amount: unitAmount,
        recurring: { interval: "month" },
        lookup_key: lookupKey,
        transfer_lookup_key: true,
        tax_behavior: "inclusive",
        product_data: { name, tax_code: SAAS_TAX_CODE },
      });
    } catch (error) {
      found = await load();
      if (!found) throw error;
    }
  }
  const productId = typeof found.product === "string" ? found.product : found.product.id;
  await ensureSaasTaxCode(stripe, productId);
  // Prices are immutable. An older price has no inclusive tax behavior, so Managed Payments would add tax on top of the advertised rate.
  if (found.tax_behavior !== "inclusive") {
    found = await stripe.prices.create({
      currency: "usd",
      unit_amount: unitAmount,
      recurring: { interval: "month" },
      lookup_key: lookupKey,
      transfer_lookup_key: true,
      tax_behavior: "inclusive",
      product: productId,
    });
  }
  return { priceId: found.id, productId };
}

/** Percent off the Vendor Desk price only. The online-payments add-on is a separate product. */
async function basePercentCoupon(stripe: Stripe, productId: string, percentOff: number) {
  const id = `portonos_vendor_base_${percentOff}_${productId.replace(/[^a-zA-Z0-9]/g, "").slice(-8)}`;
  try {
    await stripe.coupons.retrieve(id);
    return id;
  } catch (error) {
    if (!missingResource(error)) throw error;
  }
  await stripe.coupons.create({
    id,
    percent_off: percentOff,
    duration: "forever",
    name: percentOff === 100 ? "Founding vendor" : `Vendor desk ${percentOff}% off`,
    applies_to: { products: [productId] },
  });
  return id;
}

function meta(draft: VendorSignupDraft): Stripe.MetadataParam {
  return {
    flow: "vendor_signup",
    companyName: draft.companyName.slice(0, 500),
    contactName: draft.contactName.slice(0, 500),
    email: draft.email.slice(0, 500),
    phone: draft.phone.slice(0, 40),
    city: draft.city.slice(0, 80),
    state: draft.state.slice(0, 40),
    trade: draft.trade.slice(0, 80),
    payments: draft.payments ? "1" : "0",
    promoCode: draft.promoCode || "",
  };
}

export function draftFromCheckoutSession(session: Stripe.Checkout.Session): { ignored: true } | { error: string; status: number } | { draft: VendorSignupDraft } {
  const metadata = session.metadata || {};
  if (metadata.flow !== "vendor_signup") return { ignored: true as const };
  const quoted = quoteVendorSignup({
    companyName: metadata.companyName || "",
    contactName: metadata.contactName || "",
    email: metadata.email || "",
    phone: metadata.phone || "",
    city: metadata.city || "",
    state: metadata.state || "",
    trade: metadata.trade || "",
    payments: metadata.payments === "1",
    promoCode: metadata.promoCode || "",
  });
  if ("error" in quoted) return quoted;
  if (typeof session.amount_total === "number" && session.amount_total !== quoted.draft.monthlyCents) {
    return { error: "Checkout total does not match this vendor plan.", status: 409 as const };
  }
  const paid = session.status === "complete" && (session.payment_status === "paid" || session.payment_status === "no_payment_required");
  if (!paid) return { error: "Checkout is not paid.", status: 402 as const };
  return { draft: quoted.draft };
}

/**
 * Stripe subscription for the vendor desk.
 * Moov is not used here. Moov is the planned rail for tenant rent and invoice payments.
 */
export async function createVendorCheckoutSession(draft: VendorSignupDraft, origin: string) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured.");
  const promo = draft.promoCode ? lookupVendorPromo(draft.promoCode) : null;
  const base = await monthlyPrice(stripe, BASE_LOOKUP, "portonOS Vendor Desk", VENDOR_BASE_CENTS);
  const addon = draft.payments
    ? await monthlyPrice(stripe, ADDON_LOOKUP, "portonOS Vendor Desk online payments", VENDOR_PAYMENTS_ADDON_CENTS)
    : null;
  const coupon = promo && promo.percentOff > 0 ? await basePercentCoupon(stripe, base.productId, promo.percentOff) : "";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    // This account sells through Managed Payments. Turning it off creates a session that fails on Subscribe.
    managed_payments: { enabled: true },
    customer_email: draft.email,
    client_reference_id: draft.email.slice(0, 200),
    metadata: meta(draft),
    subscription_data: { metadata: meta(draft) },
    success_url: `${origin}/api/vendors/signup/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/vendors/signup?canceled=1`,
    payment_method_collection: draft.monthlyCents === 0 ? "if_required" : "always",
    ...(coupon ? { discounts: [{ coupon }] } : {}),
    line_items: [
      { price: base.priceId, quantity: 1 },
      ...(addon ? [{ price: addon.priceId, quantity: 1 }] : []),
    ],
  });
  const discount = session.total_details?.amount_discount ?? 0;
  const net = (session.amount_subtotal ?? 0) - discount;
  if (net !== draft.monthlyCents && session.amount_total !== draft.monthlyCents) {
    if (session.status === "open") await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
    throw new Error(`Stripe quoted ${session.amount_total ?? "no"} cents. This plan is ${draft.monthlyCents} cents.`);
  }
  if (!session.url) throw new Error("Could not start checkout.");
  return session;
}
