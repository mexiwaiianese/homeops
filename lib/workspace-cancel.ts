import type Stripe from "stripe";
import { MONEY_BACK_DAYS } from "@/lib/public-site";
import { getOrgSubscription } from "@/lib/subscription-packages";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import type { getAuthedContext } from "@/lib/backend";

const WINDOW_MS = MONEY_BACK_DAYS * 24 * 60 * 60 * 1000;
const REASON_MAX = 500;

type Auth = Awaited<ReturnType<typeof getAuthedContext>>;

type CancelState = {
  requestedAt: string;
  accessUntil: string | null;
  refundedAt: string | null;
  reason: string | null;
  closed: boolean;
};

type MemoryBill = CancelState & {
  organizationId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

const memoryBills: Map<string, MemoryBill> =
  ((globalThis as typeof globalThis & { __homeopsCancelBills?: Map<string, MemoryBill> }).__homeopsCancelBills ??= new Map());

export type BillingView = {
  mode: "live" | "demo";
  packageName: string | null;
  renewsOn: string | null;
  canCancel: boolean;
  alreadyCanceled: boolean;
  refunded: boolean;
  accessUntil: string | null;
  reason: string | null;
  sample: boolean;
};

export type CancelResult = {
  refunded: boolean;
  accessUntil: string | null;
  endedSession: boolean;
  message: string;
};

function cleanReason(value: unknown) {
  const reason = String(value ?? "").trim();
  if (!reason) return null;
  if (reason.length > REASON_MAX) {
    throw new Error(`Keep the reason under ${REASON_MAX} characters.`);
  }
  return reason;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, (month || 1) - 1, day || 1)));
}

function withinWindow(paidAtMs: number, now = Date.now()) {
  return now - paidAtMs <= WINDOW_MS;
}

function idOf(value: string | { id: string } | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export async function billingView(auth: Auth): Promise<BillingView> {
  if (auth.demoSession && !auth.organizationId) {
    return {
      mode: "demo",
      packageName: null,
      renewsOn: null,
      canCancel: true,
      alreadyCanceled: false,
      refunded: false,
      accessUntil: null,
      reason: null,
      sample: true,
    };
  }
  if (!auth.organizationId) {
    return {
      mode: "live",
      packageName: null,
      renewsOn: null,
      canCancel: false,
      alreadyCanceled: false,
      refunded: false,
      accessUntil: null,
      reason: null,
      sample: false,
    };
  }
  const sub = await getOrgSubscription(auth.organizationId);
  const bill = memoryBills.get(auth.organizationId);
  const stored = await readStoredCancel(auth.organizationId);
  const state = stored || bill || null;
  const canCancel = !auth.role || auth.role === "owner" || auth.role === "admin";
  return {
    mode: "live",
    packageName: sub.package?.name ?? null,
    renewsOn: null,
    canCancel,
    alreadyCanceled: Boolean(state),
    refunded: Boolean(state?.refundedAt),
    accessUntil: state?.accessUntil ?? null,
    reason: state?.reason ?? null,
    sample: false,
  };
}

export async function cancelWorkspace(auth: Auth, reasonInput: unknown): Promise<CancelResult> {
  const reason = cleanReason(reasonInput);
  if (auth.demoSession && !auth.organizationId) {
    remember(auth.demoSession.email || "sample", {
      requestedAt: new Date().toISOString(),
      accessUntil: null,
      refundedAt: null,
      reason,
      closed: true,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
    return {
      refunded: false,
      accessUntil: null,
      endedSession: true,
      message: "This sample workspace was not billed. Nothing was refunded.",
    };
  }
  if (!auth.organizationId) {
    throw Object.assign(new Error("Sign in to the workspace you want to cancel."), { status: 401 });
  }
  if (auth.role && auth.role !== "owner" && auth.role !== "admin") {
    throw Object.assign(new Error("The workspace owner cancels billing."), { status: 403 });
  }

  const existing = (await readStoredCancel(auth.organizationId)) || memoryBills.get(auth.organizationId) || null;
  if (existing) {
    return resultFromState(existing);
  }

  const sub = await getOrgSubscription(auth.organizationId);
  const stripe = getStripe();
  const customerId = "stripeCustomerId" in sub ? sub.stripeCustomerId ?? null : null;
  const subscriptionId = "stripeSubscriptionId" in sub ? sub.stripeSubscriptionId ?? null : null;
  const now = new Date();

  if (stripe && (subscriptionId || customerId)) {
    const outcome = await cancelStripe({
      stripe,
      customerId,
      subscriptionId,
      reason,
      now,
    });
    const state: CancelState = {
      requestedAt: now.toISOString(),
      accessUntil: outcome.accessUntil,
      refundedAt: outcome.refunded ? now.toISOString() : null,
      reason,
      closed: outcome.closed,
    };
    await persist(auth.organizationId, state, outcome.refundId, customerId, outcome.subscriptionId || subscriptionId);
    return resultFromState(state);
  }

  const createdAt = now;
  const refundable = withinWindow(createdAt.getTime(), now.getTime());
  const state: CancelState = {
    requestedAt: now.toISOString(),
    accessUntil: refundable ? null : null,
    refundedAt: null,
    reason,
    closed: true,
  };
  await persist(auth.organizationId, state, null, customerId, subscriptionId);
  return {
    refunded: false,
    accessUntil: null,
    endedSession: false,
    message: "No card was charged for this workspace, so there is nothing to refund. The workspace is closed.",
  };
}

function resultFromState(state: CancelState): CancelResult {
  if (state.refundedAt) {
    return {
      refunded: true,
      accessUntil: null,
      endedSession: false,
      message: "The invoice was refunded through the payment processor. The workspace is closed.",
    };
  }
  if (state.accessUntil && !state.closed) {
    return {
      refunded: false,
      accessUntil: state.accessUntil,
      endedSession: false,
      message: `Canceled. You keep the workspace until ${formatDay(state.accessUntil)}. You will not be billed again.`,
    };
  }
  return {
    refunded: false,
    accessUntil: state.accessUntil,
    endedSession: false,
    message: "Canceled. You will not be billed again.",
  };
}

async function cancelStripe(input: {
  stripe: Stripe;
  customerId: string | null;
  subscriptionId: string | null;
  reason: string | null;
  now: Date;
}) {
  let subscriptionId = input.subscriptionId;
  if (!subscriptionId && input.customerId) {
    const listed = await input.stripe.subscriptions.list({ customer: input.customerId, status: "all", limit: 5 });
    subscriptionId = listed.data.find((row) => row.status === "active" || row.status === "trialing" || row.status === "past_due")?.id
      ?? listed.data[0]?.id
      ?? null;
  }
  if (!subscriptionId) {
    return { refunded: false, refundId: null, accessUntil: null, closed: true, subscriptionId: null };
  }

  const invoices = await input.stripe.invoices.list({ subscription: subscriptionId, status: "paid", limit: 1 });
  const latest = invoices.data[0];
  if (!latest || !latest.amount_paid) {
    await input.stripe.subscriptions.cancel(subscriptionId);
    return { refunded: false, refundId: null, accessUntil: null, closed: true, subscriptionId };
  }

  const detailed = await input.stripe.invoices.retrieve(latest.id, { expand: ["payments"] });
  const payment = detailed.payments?.data.find((row) => row.status === "paid") ?? detailed.payments?.data[0];
  const paidAtSec = payment?.status_transitions.paid_at ?? detailed.created;
  const refundable = withinWindow(paidAtSec * 1000, input.now.getTime());

  if (refundable) {
    const paymentIntent = idOf(payment?.payment.payment_intent);
    const charge = idOf(payment?.payment.charge);
    if (!paymentIntent && !charge) {
      throw Object.assign(new Error("The invoice was paid, but the payment processor did not return a charge to refund."), { status: 502 });
    }
    const refund = await input.stripe.refunds.create({
      ...(paymentIntent ? { payment_intent: paymentIntent } : { charge: charge! }),
      reason: "requested_by_customer",
    });
    await input.stripe.subscriptions.cancel(subscriptionId, {
      cancellation_details: input.reason ? { comment: input.reason } : undefined,
    });
    return { refunded: true, refundId: refund.id, accessUntil: null, closed: true, subscriptionId };
  }

  const updated = await input.stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
    cancellation_details: input.reason ? { comment: input.reason } : undefined,
  });
  const until = updated.cancel_at ? isoDate(new Date(updated.cancel_at * 1000)) : null;
  return { refunded: false, refundId: null, accessUntil: until, closed: false, subscriptionId };
}

function remember(organizationId: string, state: Omit<MemoryBill, "organizationId">) {
  memoryBills.set(organizationId, { ...state, organizationId });
}

async function persist(
  organizationId: string,
  state: CancelState,
  refundId: string | null,
  stripeCustomerId: string | null,
  stripeSubscriptionId: string | null,
) {
  remember(organizationId, { ...state, stripeCustomerId, stripeSubscriptionId });
  const db = createSupabaseAdminClient();
  if (!db) return;
  const status = state.closed ? "canceled" : "active";
  const patch: Record<string, string | null> = {
    status,
    cancel_requested_at: state.requestedAt,
    access_until: state.accessUntil,
    refunded_at: state.refundedAt,
    updated_at: state.requestedAt,
  };
  if (stripeCustomerId) patch.stripe_customer_id = stripeCustomerId;
  if (stripeSubscriptionId) patch.stripe_subscription_id = stripeSubscriptionId;
  const { error: subError } = await db.from("organization_subscriptions").update(patch).eq("organization_id", organizationId);
  if (subError) console.warn("[workspace-cancel] could not update subscription", subError.message);
  const { error: reasonError } = await db.from("workspace_cancellations").insert({
    organization_id: organizationId,
    reason: state.reason,
    refunded: Boolean(state.refundedAt),
    stripe_refund_id: refundId,
    access_until: state.accessUntil,
  });
  if (reasonError) console.warn("[workspace-cancel] could not store the reason", reasonError.message);
}

async function readStoredCancel(organizationId: string): Promise<CancelState | null> {
  const db = createSupabaseAdminClient();
  if (!db) return memoryBills.get(organizationId) ?? null;
  const { data, error } = await db
    .from("organization_subscriptions")
    .select("cancel_requested_at, access_until, refunded_at, status")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !data?.cancel_requested_at) return memoryBills.get(organizationId) ?? null;
  const { data: reasonRow } = await db
    .from("workspace_cancellations")
    .select("reason")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return {
    requestedAt: data.cancel_requested_at,
    accessUntil: data.access_until,
    refundedAt: data.refunded_at,
    reason: reasonRow?.reason ?? null,
    closed: data.status === "canceled" || !data.access_until,
  };
}
