import { NextResponse } from "next/server";
import { issueResendMagicLink } from "@/lib/auth-magic-link";
import { applyClearedDemoCookies } from "@/lib/demo-access";
import { quoteVendorSignup } from "@/lib/vendor-billing-demo";
import { createVendorCheckoutSession } from "@/lib/vendor-checkout";
import { provisionVendorAccount } from "@/lib/vendor-provision";
import { dollars } from "@/lib/vendor-plans";
import { stripeReady } from "@/lib/stripe";
import { demoVendorSessionCookie } from "@/lib/vendor-job-demo";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const quoted = quoteVendorSignup({
    companyName: String(body.companyName || ""),
    contactName: String(body.contactName || ""),
    email: String(body.email || ""),
    phone: String(body.phone || ""),
    city: String(body.city || ""),
    state: String(body.state || ""),
    trade: String(body.trade || ""),
    payments: Boolean(body.payments),
    promoCode: String(body.promoCode || ""),
  });
  if ("error" in quoted) return NextResponse.json({ error: quoted.error }, { status: quoted.status });

  const draft = quoted.draft;
  const plan = draft.monthlyCents === 0 ? "Free" : `${dollars(draft.monthlyCents)}/mo`;
  const origin = new URL(request.url).origin;

  if (stripeReady()) {
    try {
      const session = await createVendorCheckoutSession(draft, origin);
      return NextResponse.json({
        ok: true,
        mode: "checkout" as const,
        checkoutUrl: session.url,
        plan,
        dueCents: draft.monthlyCents,
        payments: draft.payments,
        promoCode: draft.promoCode,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start checkout.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  const saved = await provisionVendorAccount(draft);
  if (!("subscriber" in saved)) return NextResponse.json({ error: saved.error }, { status: saved.status });
  const payload = {
    created: saved.created,
    subscriber: {
      id: saved.subscriber.id,
      companyName: saved.subscriber.companyName,
      payments: saved.subscriber.payments,
      monthlyCents: saved.subscriber.monthlyCents,
    },
    plan,
    billing: "Plan reserved. The monthly charge starts when Stripe is connected on this server.",
  };

  if (saved.mode === "live") {
    const mailed = await issueResendMagicLink({
      email: draft.email,
      origin,
      next: "/vendors/desk",
      createUser: true,
    });
    const response = NextResponse.json({
      ...payload,
      mode: "live" as const,
      emailed: !("error" in mailed),
      emailError: "error" in mailed ? mailed.error : null,
      message: "error" in mailed ? mailed.error : `Check ${draft.email} for a one-time sign-in link.`,
      devLink: "devLink" in mailed ? mailed.devLink : undefined,
    });
    applyClearedDemoCookies(response);
    return response;
  }

  const response = NextResponse.json({ ...payload, mode: "demo" as const });
  applyClearedDemoCookies(response);
  response.cookies.set(demoVendorSessionCookie, saved.subscriber.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 14 });
  return response;
}
