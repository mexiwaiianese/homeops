import Stripe from "stripe";

let client: Stripe | null | undefined;

export function getStripe() {
  if (client !== undefined) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    client = null;
    return null;
  }
  client = new Stripe(key);
  return client;
}

export function stripePublishableKey() {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null;
}

export function stripeReady() {
  return Boolean(getStripe() && stripePublishableKey());
}

/** True only for Stripe test keys. Sandbox products below do not exist on a live account. */
export function stripeTestMode() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  return key.includes("_test_");
}

/**
 * Workspace subscription products in the Stripe sandbox.
 * The unlabeled product is Core. Do not send these IDs with a live key.
 */
export const STRIPE_SANDBOX_SUBSCRIPTION_PRODUCTS = {
  core: "prod_VOVu29UXcJ1XgX",
  operations: "prod_VOVxRxzmp5KXOZ",
  portfolio: "prod_VOVzXZN7HxjLOZ",
} as const;

/** Customer-facing code 4COR3. Sandbox promotion only. */
export const STRIPE_SANDBOX_CORE_PROMOTION_CODE = "promo_1UNj1j6BJQK28RoBI0CQtSwG";

export function sandboxSubscriptionProductId(packageId: string) {
  if (!stripeTestMode()) return null;
  if (packageId === "core" || packageId === "operations" || packageId === "portfolio") {
    return STRIPE_SANDBOX_SUBSCRIPTION_PRODUCTS[packageId];
  }
  return null;
}

/** Prefer the product's yearly price. Falls back to the default price on that sandbox product. */
export async function sandboxSubscriptionPriceId(stripe: Stripe, productId: string) {
  const product = await stripe.products.retrieve(productId, { expand: ["default_price"] });
  const defaultPrice = product.default_price;
  if (defaultPrice && typeof defaultPrice === "object" && defaultPrice.recurring?.interval === "year") {
    return defaultPrice.id;
  }
  const listed = await stripe.prices.list({ product: productId, active: true, limit: 10 });
  const yearly = listed.data.find((row) => row.recurring?.interval === "year");
  if (yearly) return yearly.id;
  if (typeof defaultPrice === "string" && defaultPrice) return defaultPrice;
  if (defaultPrice && typeof defaultPrice === "object") return defaultPrice.id;
  const fallback = listed.data[0];
  if (!fallback) throw new Error("This package has no active price in the Stripe sandbox.");
  return fallback.id;
}
