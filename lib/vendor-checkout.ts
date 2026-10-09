import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { quoteVendorSignup, type VendorSignupDraft } from "@/lib/vendor-billing-demo";
import { lookupVendorPromo, VENDOR_BASE_CENTS, VENDOR_PAYMENTS_ADDON_CENTS } from "@/lib/vendor-plans";

const BASE_LOOKUP = "portonos_vendor_desk_monthly";
const ADDON_LOOKUP = "portonos_vendor_payments_monthly";

function missingResource(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "resource_missing");
}

async function monthlyPrice(stripe: Stripe, lookupKey: string, name: string, unitAmount: number) {
  const load = async () => {
    const listed = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
    return listed.data.find((row) => row.unit_amount === unitAmount && row.recurring?.interval === "month" && row.currency === "usd") || null;
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
        product_data: { name },
      });
    } catch (error) {
      found = await load();
      if (!found) throw error;
    }
  }
  const productId = typeof found.product === "string" ? found.product : found.product.id;
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
    managed_payments: { enabled: false },
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
  if (session.amount_total !== draft.monthlyCents) {
    if (session.status === "open") await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
    throw new Error(`Stripe quoted ${session.amount_total ?? "no"} cents. This plan is ${draft.monthlyCents} cents.`);
  }
  if (!session.url) throw new Error("Could not start checkout.");
  return session;
}
