import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getDemoApplication, markDemoApplicationFee, publicDemoListing } from "@/lib/application-demo";
import { findLiveApplicationByIntent, markLiveApplicationFee, publicLiveListing } from "@/lib/application-live";
import { getStripe, stripeReady } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const body = await request.json().catch(() => ({}));
  const applicationId = String(body.applicationId || "");
  if (!applicationId) return NextResponse.json({ error: "applicationId is required." }, { status: 400 });

  if (!isSupabaseConfigured()) {
    const listing = publicDemoListing(token);
    const application = getDemoApplication(applicationId);
    if (!listing || !application || application.listingId !== listing.listingId) return NextResponse.json({ error: "Application not found." }, { status: 404 });
    if (application.feeStatus === "paid" || application.feeStatus === "waived") return NextResponse.json({ feeStatus: application.feeStatus });
    if (body.action === "confirm" || body.action === "demo-pay") {
      markDemoApplicationFee(application.id, "paid");
      return NextResponse.json({ feeStatus: "paid", mode: "demo" });
    }
    if (!stripeReady()) {
      return NextResponse.json({ feeStatus: "unpaid", mode: "demo" });
    }
    const stripe = getStripe();
    if (!stripe) return NextResponse.json({ error: "Card payments are not configured." }, { status: 503 });
    const intent = await stripe.paymentIntents.create({
      amount: application.feeCents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: { applicationId: application.id, source: "rental_application" },
    }, { idempotencyKey: `application-${application.id}` });
    return NextResponse.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id, publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  const listing = await publicLiveListing(admin, token);
  if (!listing) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  const { data } = await admin.from("rental_applications").select("id, listing_id, fee_cents, fee_status, stripe_payment_intent_id").eq("id", applicationId).eq("listing_id", listing.listingId).maybeSingle();
  if (!data) return NextResponse.json({ error: "Application not found." }, { status: 404 });
  if (data.fee_status === "paid" || data.fee_status === "waived") return NextResponse.json({ feeStatus: data.fee_status });
  if (body.action === "confirm" && body.paymentIntentId) {
    const existing = await findLiveApplicationByIntent(admin, String(body.paymentIntentId));
    if (existing?.fee_status === "paid") return NextResponse.json({ feeStatus: "paid" });
    await markLiveApplicationFee(admin, data.id, "paid", String(body.paymentIntentId));
    return NextResponse.json({ feeStatus: "paid" });
  }
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "Card payments are not configured." }, { status: 503 });
  const intent = data.stripe_payment_intent_id
    ? await stripe.paymentIntents.retrieve(data.stripe_payment_intent_id)
    : await stripe.paymentIntents.create({
      amount: data.fee_cents,
      currency: "usd",
      automatic_payment_methods: { enabled: true },
      metadata: { applicationId: data.id, source: "rental_application" },
    }, { idempotencyKey: `application-${data.id}` });
  if (!data.stripe_payment_intent_id) await markLiveApplicationFee(admin, data.id, "unpaid", intent.id);
  return NextResponse.json({ clientSecret: intent.client_secret, paymentIntentId: intent.id, publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY });
}
