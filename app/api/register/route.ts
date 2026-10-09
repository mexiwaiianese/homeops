import { NextResponse } from "next/server";
import { validEmail } from "@/lib/demo-access";
import { clientKey, unlockAttemptAllowed } from "@/lib/persona-login/gate";
import { createPlatformSignup } from "@/lib/platform-signup";
import { annualBillCents, publicPackageById } from "@/lib/public-site";
import { listPackages } from "@/lib/subscription-packages";
import { getStripe, sandboxSubscriptionPriceId, sandboxSubscriptionProductId, STRIPE_SANDBOX_CORE_PROMOTION_CODE, stripeReady } from "@/lib/stripe";
import { sendVendorEmail } from "@/lib/vendor-outreach";

const CORE_FIRST_YEAR_COUPON = "portonos_core_first_year";

async function coreFirstYearCoupon(stripe: NonNullable<ReturnType<typeof getStripe>>, amountOff: number) {
  try {
    await stripe.coupons.retrieve(CORE_FIRST_YEAR_COUPON);
    return CORE_FIRST_YEAR_COUPON;
  } catch (error) {
    const missing = Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "resource_missing");
    if (!missing) throw error;
    await stripe.coupons.create({
      id: CORE_FIRST_YEAR_COUPON,
      amount_off: amountOff,
      currency: "usd",
      duration: "once",
      name: "Core first year: 3 months at $25 and 9 months at $99",
    });
    return CORE_FIRST_YEAR_COUPON;
  }
}

export async function GET() {
  const packages = (await listPackages()).filter((row) => Boolean(publicPackageById(row.id)));
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

  const packages = (await listPackages()).filter((row) => Boolean(publicPackageById(row.id)));
  const requestedPackage = String(body.packageId || "");
  const pkg = packages.find((row) => row.id === requestedPackage);
  if (!pkg) return NextResponse.json({ error: "Choose a workspace package." }, { status: 400 });
  const origin = new URL(request.url).origin;
  const { signup, token } = await createPlatformSignup({
    email,
    fullName,
    organizationName,
    packageId: pkg.id,
  });

  const advertised = publicPackageById(pkg.id);
  const monthlyAmount = advertised?.listCents ?? pkg.monthlyCents;
  const yearTwo = advertised ? annualBillCents(advertised, 2) : monthlyAmount * 12;
  const yearOne = advertised ? annualBillCents(advertised, 1) : yearTwo;
  const sandboxProduct = sandboxSubscriptionProductId(pkg.id);
  if ((sandboxProduct || yearTwo > 0) && stripeReady()) {
    const stripe = getStripe();
    if (!stripe) return NextResponse.json({ error: "Billing is not configured." }, { status: 400 });
    const introOff = yearTwo - yearOne;
    const coupon = sandboxProduct || introOff <= 0 ? "" : await coreFirstYearCoupon(stripe, introOff);
    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer_email: email,
        client_reference_id: signup.id,
        metadata: { signupId: signup.id, tokenHash: signup.tokenHash, packageId: pkg.id },
        success_url: `${origin}/api/register/enter?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/register?canceled=1`,
        ...(sandboxProduct && pkg.id === "core" ? { discounts: [{ promotion_code: STRIPE_SANDBOX_CORE_PROMOTION_CODE }] } : {}),
        ...(coupon ? { discounts: [{ coupon }] } : {}),
        line_items: [sandboxProduct
          ? { quantity: 1, price: await sandboxSubscriptionPriceId(stripe, sandboxProduct) }
          : {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: yearTwo,
                recurring: { interval: "year" },
                product_data: { name: `portonOS ${pkg.name}` },
              },
            }],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start checkout.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
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
