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
