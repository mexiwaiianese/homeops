import { NextResponse } from "next/server";
import { analytics } from "@heycatch/sdk";
import { baseCookieOptions } from "@/lib/persona-login/gate";
import {
  findSignupByStripeSession,
  findSignupByToken,
  markSignup,
  provisionSignup,
  ensureAuthUser,
} from "@/lib/platform-signup";
import { blankWorkspaceCookie } from "@/lib/provision-org";
import { saveOrgSubscription } from "@/lib/subscription-packages";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

analytics.init({ projectKey: "hck_pk_mXc0gtQUqyM0DSQdUfQCORLW85pMGXxA" });

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const sessionId = url.searchParams.get("session_id") || "";
  let signup = token ? await findSignupByToken(token) : null;
  if (!signup && sessionId) {
    const stripe = getStripe();
    if (stripe) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status === "paid" || session.status === "complete") {
        signup = await findSignupByStripeSession(session.id);
        if (signup) await markSignup(signup.id, { status: "paid", stripeSessionId: session.id });
      }
    }
  }
  if (!signup) {
    const dest = new URL("/register", request.url);
    dest.searchParams.set("error", "That registration link is invalid or expired.");
    return NextResponse.redirect(dest);
  }

  const signupWasCompleted = signup.status === "provisioned";
  const admin = createSupabaseAdminClient();
  const user = admin ? await ensureAuthUser(signup.email, signup.fullName) : null;
  const workspace = await provisionSignup(signup, user?.id ?? null);
  const checkoutId = sessionId || signup.stripeSessionId || "";
  if (checkoutId) await attachCheckoutToWorkspace(checkoutId, workspace.organizationId, workspace.packageId);
  if (!signupWasCompleted && user) {
    await analytics.setIdentity(user.id, {
      email: signup.email,
      name: signup.fullName,
      plan: workspace.packageId,
    });
    await analytics.trackEvent(
      "signup_completed",
      { plan: workspace.packageId },
      { userId: user.id, request },
    );
    if (checkoutId) {
      await analytics.trackEvent(
        "subscription_started",
        { plan: workspace.packageId },
        { userId: user.id, request },
      );
    }
  }

  if (admin && user) {
    const { data } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: signup.email,
      options: { redirectTo: `${url.origin}/auth/callback?next=/app` },
    });
    const hashed = data?.properties?.hashed_token;
    const verifyType = data?.properties?.verification_type || "magiclink";
    if (hashed) {
      return NextResponse.redirect(`${url.origin}/auth/callback?token_hash=${encodeURIComponent(hashed)}&type=${encodeURIComponent(verifyType)}&next=${encodeURIComponent("/app")}`);
    }
  }

  const dest = new URL("/app", request.url);
  const response = NextResponse.redirect(dest);
  const demo = (await import("@/lib/demo-access")).clearDemoSessionCookie();
  response.cookies.set(demo.name, demo.value, demo.options);
  response.cookies.set(blankWorkspaceCookie, workspace.organizationId, baseCookieOptions(14 * 24 * 60 * 60));
  return response;
}

async function attachCheckoutToWorkspace(sessionId: string, organizationId: string, packageId: string) {
  const stripe = getStripe();
  if (!stripe) return;
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
  if (!customerId && !subscriptionId) return;
  await saveOrgSubscription({
    organizationId,
    packageId,
    status: "active",
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
  });
}
