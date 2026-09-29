import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { registerVendorSubscriber } from "@/lib/vendor-billing-demo";
import { saveLiveSignup } from "@/lib/vendor-billing-live";
import { dollars } from "@/lib/vendor-plans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

  const { supabase } = await getAuthedContext();
  const admin = createSupabaseAdminClient();
  if (supabase && admin) {
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
  }
  const monthlyCents = result.subscriber.monthlyCents;
  const plan = monthlyCents === 0 ? "Free" : `${dollars(monthlyCents)}/mo`;
  const response = NextResponse.json({
    mode: supabase ? "live" : "demo",
    created: result.created,
    subscriber: {
      id: result.subscriber.id,
      companyName: result.subscriber.companyName,
      payments: result.subscriber.payments,
      monthlyCents: result.subscriber.monthlyCents,
    },
    plan,
    // Card billing is a Stripe subscription. Until a price is configured, the plan is reserved and the desk is usable.
    billing: "Plan reserved. The monthly charge starts when card billing is connected on this server.",
  });
  if (!supabase) {
    response.cookies.set(demoVendorSessionCookie, result.subscriber.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 14 });
  }
  return response;
}
