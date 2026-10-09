import { ensureAuthUser } from "@/lib/platform-signup";
import { upsertVendorSubscriber, type VendorSubscriber, type VendorSignupDraft } from "@/lib/vendor-billing-demo";
import { saveLiveSignup } from "@/lib/vendor-billing-live";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function provisionVendorAccount(draft: VendorSignupDraft, stripe?: {
  customerId?: string | null;
  subscriptionId?: string | null;
  checkoutSessionId?: string | null;
}): Promise<{ error: string; status: number } | { subscriber: VendorSubscriber; created: boolean; mode: "live" | "demo" }> {
  const stored = upsertVendorSubscriber(draft);
  if (!("subscriber" in stored)) return stored;
  const live = isSupabaseConfigured();
  const admin = createSupabaseAdminClient();
  if (live && !admin) return { error: "Vendor sign-in is not configured on this server.", status: 503 as const };
  if (live && admin) {
    const saved = await saveLiveSignup(admin, {
      ...draft,
      refreshPlan: true,
      stripeCustomerId: stripe?.customerId,
      stripeSubscriptionId: stripe?.subscriptionId,
      stripeCheckoutSessionId: stripe?.checkoutSessionId,
    });
    if ("error" in saved) return { error: saved.error || "Could not save the signup.", status: 400 as const };
    try {
      await ensureAuthUser(draft.email, draft.contactName);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Could not create the login.", status: 400 as const };
    }
    return { subscriber: stored.subscriber, created: stored.created, mode: "live" as const };
  }
  return { subscriber: stored.subscriber, created: stored.created, mode: "demo" as const };
}
