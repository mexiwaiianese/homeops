import { NextResponse } from "next/server";
import { draftFromCheckoutSession } from "@/lib/vendor-checkout";
import { provisionVendorAccount } from "@/lib/vendor-provision";
import { applyClearedDemoCookies } from "@/lib/demo-access";
import { demoVendorSessionCookie } from "@/lib/vendor-job-demo";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function signupError(request: Request, message: string) {
  const dest = new URL("/vendors/signup", request.url);
  dest.searchParams.set("error", message);
  return NextResponse.redirect(dest);
}

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id") || "";
  const stripe = getStripe();
  if (!stripe || !sessionId.startsWith("cs_")) return signupError(request, "That checkout session is missing.");
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const quoted = draftFromCheckoutSession(session);
  if ("ignored" in quoted) return signupError(request, "That checkout is not a vendor signup.");
  if (!("draft" in quoted)) return signupError(request, quoted.error);

  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  const saved = await provisionVendorAccount(quoted.draft, {
    customerId,
    subscriptionId,
    checkoutSessionId: session.id,
  });
  if (!("subscriber" in saved)) return signupError(request, saved.error);

  const origin = new URL(request.url).origin;
  const admin = createSupabaseAdminClient();
  if (saved.mode === "live" && admin) {
    const { data } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: quoted.draft.email,
      options: { redirectTo: `${origin}/auth/callback?next=/vendors/desk` },
    });
    const hashed = data?.properties?.hashed_token;
    const verifyType = data?.properties?.verification_type || "magiclink";
    if (hashed) {
      return NextResponse.redirect(`${origin}/auth/callback?token_hash=${encodeURIComponent(hashed)}&type=${encodeURIComponent(verifyType)}&next=${encodeURIComponent("/vendors/desk")}`);
    }
    const dest = new URL("/vendors/login", request.url);
    dest.searchParams.set("email", quoted.draft.email);
    return NextResponse.redirect(dest);
  }

  const dest = new URL("/vendors/invoices", request.url);
  const response = NextResponse.redirect(dest);
  applyClearedDemoCookies(response);
  response.cookies.set(demoVendorSessionCookie, saved.subscriber.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 14 });
  return response;
}
