import { NextResponse } from "next/server";
import { validEmail } from "@/lib/demo-access";
import { clientKey, unlockAttemptAllowed } from "@/lib/persona-login/gate";
import { createPlatformSignup } from "@/lib/platform-signup";
import { packageById } from "@/lib/product-features";
import { listPackages } from "@/lib/subscription-packages";
import { getStripe, stripeReady } from "@/lib/stripe";
import { sendVendorEmail } from "@/lib/vendor-outreach";

export async function GET() {
  const packages = await listPackages();
  return NextResponse.json({ packages, stripe: stripeReady() });
}

export async function POST(request: Request) {
  if (!unlockAttemptAllowed(`register:${clientKey(request)}`)) {
    return NextResponse.json({ error: "Too many attempts. Wait a few minutes." }, { status: 429 });
  }
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim();
  const fullName = String(body.fullName || "").trim();
  const organizationName = String(body.organizationName || "").trim();
  if (!validEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!fullName) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  if (!organizationName) return NextResponse.json({ error: "Enter an organization name." }, { status: 400 });

  const packages = await listPackages();
  const pkg = packageById(String(body.packageId || ""), packages);
  const origin = new URL(request.url).origin;
  const { signup, token } = await createPlatformSignup({
    email,
    fullName,
    organizationName,
    packageId: pkg.id,
  });

  if (pkg.monthlyCents > 0 && stripeReady()) {
    const stripe = getStripe();
    if (!stripe) return NextResponse.json({ error: "Billing is not configured." }, { status: 400 });
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email,
      client_reference_id: signup.id,
      metadata: { signupId: signup.id, tokenHash: signup.tokenHash, packageId: pkg.id },
      success_url: `${origin}/api/register/enter?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/register?canceled=1`,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: pkg.monthlyCents,
          recurring: { interval: "month" },
          product_data: { name: `portonOS ${pkg.name}` },
        },
      }],
    });
    if (!session.url) return NextResponse.json({ error: "Could not start checkout." }, { status: 500 });
    signup.stripeSessionId = session.id;
    const admin = (await import("@/lib/supabase/admin")).createSupabaseAdminClient();
    if (admin) await admin.from("platform_signups").update({ stripe_session_id: session.id, status: "pending" }).eq("id", signup.id);
    return NextResponse.json({ ok: true, checkoutUrl: session.url });
  }

  const url = `${origin}/api/register/enter?token=${encodeURIComponent(token)}`;
  const delivery = await sendVendorEmail({
    to: email,
    subject: "Confirm your portonOS workspace",
    text: [
      `Confirm ${organizationName} and open a blank portonOS workspace:`,
      "",
      url,
      "",
      "This link is unique to your registration.",
      "If you did not start this, ignore the email.",
    ].join("\n"),
  });
  if (!delivery.sent) {
    if (delivery.provider === "unconfigured" && process.env.NODE_ENV !== "production") {
      return NextResponse.json({ ok: true, devLink: url });
    }
    return NextResponse.json({ error: delivery.error || "Could not send the confirmation email." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
