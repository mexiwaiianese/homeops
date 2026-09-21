export type RentChargeKind = "rent" | "deposit" | "late_fee" | "other";
export type RentChargeStatus = "due" | "processing" | "paid" | "failed" | "void" | "partial";
export type RentPaymentMethod = "stripe_card" | "stripe_ach" | "cash" | "check" | "other" | "demo";
export type RentPaymentStatus = "pending" | "succeeded" | "failed" | "refunded";

export type RentPayment = {
  id: string;
  chargeId: string;
  amountCents: number;
  method: RentPaymentMethod;
  status: RentPaymentStatus;
  stripePaymentIntentId?: string | null;
  failureReason?: string | null;
  receivedAt: string;
};

export type RentCharge = {
  id: string;
  homeId: string;
  leaseId?: string | null;
  tenantId: string;
  tenantName: string;
  address: string;
  kind: RentChargeKind;
  periodStart: string;
  periodEnd: string;
  dueOn: string;
  amountCents: number;
  paidCents: number;
  status: RentChargeStatus;
  payToken: string;
  stripePaymentIntentId?: string | null;
  notes?: string | null;
  payments: RentPayment[];
};

export function moneyCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export function currentRentPeriod(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    periodStart: iso(start),
    periodEnd: iso(end),
    dueOn: iso(start),
    label: start.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  };
}

export function remainingCents(charge: Pick<RentCharge, "amountCents" | "paidCents">) {
  return Math.max(0, charge.amountCents - charge.paidCents);
}

export function refreshChargeStatus(charge: RentCharge): RentChargeStatus {
  if (charge.status === "void") return "void";
  if (charge.paidCents >= charge.amountCents && charge.amountCents > 0) return "paid";
  if (charge.paidCents > 0) return "partial";
  if (charge.payments.some((row) => row.status === "pending")) return "processing";
  if (charge.payments.some((row) => row.status === "failed") && charge.paidCents === 0) return "failed";
  return "due";
}

export function payPath(token: string) {
  return `/pay/${token}`;
}

export function appOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const forwarded = request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (forwarded) return `${proto}://${forwarded.split(",")[0].trim()}`;
  return new URL(request.url).origin;
}

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

export function publicCharge(charge: RentCharge, origin?: string) {
  const remaining = remainingCents(charge);
  return {
    id: charge.id,
    tenantName: charge.tenantName,
    address: charge.address,
    homeId: charge.homeId,
    tenantId: charge.tenantId,
    kind: charge.kind,
    periodStart: charge.periodStart,
    periodEnd: charge.periodEnd,
    dueOn: charge.dueOn,
    amountCents: charge.amountCents,
    paidCents: charge.paidCents,
    remainingCents: remaining,
    status: refreshChargeStatus(charge),
    payToken: charge.payToken,
    payUrl: `${(origin || "").replace(/\/$/, "")}${payPath(charge.payToken)}`,
    notes: charge.notes,
    payments: charge.payments,
  };
}
