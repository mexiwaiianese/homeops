import { NextResponse } from "next/server";
import { issueResendMagicLink } from "@/lib/auth-magic-link";
import { applyClearedDemoCookies } from "@/lib/demo-access";
import { ensureAuthUser } from "@/lib/platform-signup";
import { registerVendorSubscriber } from "@/lib/vendor-billing-demo";
import { saveLiveSignup } from "@/lib/vendor-billing-live";
import { dollars } from "@/lib/vendor-plans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { demoVendorSessionCookie } from "@/lib/vendor-job-demo";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const payments = Boolean(body.payments);
  const result = registerVendorSubscriber({
    companyName: String(body.companyName || ""),
    contactName: String(body.contactName || ""),
    email: String(body.email || ""),
    phone: String(body.phone || ""),
    city: String(body.city || ""),
    state: String(body.state || ""),
    trade: String(body.trade || ""),
    payments,
    promoCode: String(body.promoCode || ""),
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const live = isSupabaseConfigured();
  const admin = createSupabaseAdminClient();
  if (live && !admin) {
    return NextResponse.json({ error: "Vendor sign-in is not configured on this server." }, { status: 503 });
  }

  const monthlyCents = result.subscriber.monthlyCents;
  const plan = monthlyCents === 0 ? "Free" : `${dollars(monthlyCents)}/mo`;
  const payload = {
    created: result.created,
    subscriber: {
      id: result.subscriber.id,
      companyName: result.subscriber.companyName,
      payments: result.subscriber.payments,
      monthlyCents: result.subscriber.monthlyCents,
    },
    plan,
    billing: "Plan reserved. The monthly charge starts when card billing is connected on this server.",
  };

  if (live && admin) {
    const saved = await saveLiveSignup(admin, {
      companyName: result.subscriber.companyName,
      contactName: result.subscriber.contactName,
      email: result.subscriber.email,
      phone: result.subscriber.phone,
      city: result.subscriber.city,
      state: result.subscriber.state,
      trade: result.subscriber.trade,
      payments: result.subscriber.payments,
      promoCode: result.subscriber.promoCode,
      monthlyCents: result.subscriber.monthlyCents,
    });
    if ("error" in saved) return NextResponse.json({ error: saved.error }, { status: 400 });
    try {
      await ensureAuthUser(result.subscriber.email, result.subscriber.contactName);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create the login." }, { status: 400 });
    }
    const mailed = await issueResendMagicLink({
      email: result.subscriber.email,
      origin: new URL(request.url).origin,
      next: "/vendors/desk",
      createUser: true,
    });
    const response = NextResponse.json({
      ...payload,
      mode: "live" as const,
      emailed: !("error" in mailed),
      emailError: "error" in mailed ? mailed.error : null,
      message: "error" in mailed
        ? mailed.error
        : `Check ${result.subscriber.email} for a one-time sign-in link.`,
      devLink: "devLink" in mailed ? mailed.devLink : undefined,
    });
    applyClearedDemoCookies(response);
    return response;
  }

  const response = NextResponse.json({ ...payload, mode: "demo" as const });
  applyClearedDemoCookies(response);
  response.cookies.set(demoVendorSessionCookie, result.subscriber.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 14 });
  return response;
}
