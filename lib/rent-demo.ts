import { homes, tenants } from "@/lib/data";
import { postDemoRentPayment } from "@/lib/books-demo";
import {
  currentRentPeriod,
  refreshChargeStatus,
  remainingCents,
  type RentCharge,
  type RentPayment,
} from "@/lib/rent";

type Store = { charges: Map<string, RentCharge> };

const store: Store =
  ((globalThis as typeof globalThis & { __homeopsRent?: Store }).__homeopsRent ??= {
    charges: new Map(),
  });

function token() {
  return `pay-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function seedIfNeeded() {
  if (store.charges.size) return;
  const period = currentRentPeriod();
  for (const tenant of tenants) {
    const home = homes.find((row) => row.tenantId === tenant.id);
    if (!home) continue;
    const paid = tenant.balance === 0;
    const id = `chg-${tenant.id}-${period.periodStart}`;
    const payment: RentPayment | null = paid
      ? {
          id: `pmt-${id}`,
          chargeId: id,
          amountCents: Math.round(home.rent * 100),
          method: "stripe_ach",
          status: "succeeded",
          receivedAt: new Date(`${period.periodStart}T15:00:00`).toISOString(),
        }
      : null;
    store.charges.set(id, {
      id,
      homeId: home.id,
      leaseId: `lease-${tenant.id}`,
      tenantId: tenant.id,
      tenantName: tenant.name,
      address: home.address,
      kind: "rent",
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      dueOn: period.dueOn,
      amountCents: Math.round(home.rent * 100),
      paidCents: payment ? payment.amountCents : 0,
      status: paid ? "paid" : "due",
      payToken: tenant.id === "t3" ? "pay-demo-t3" : token(),
      notes: paid ? "Autopay ACH cleared." : "Current month rent is outstanding.",
      payments: payment ? [payment] : [],
    });
    if (payment) {
      postDemoRentPayment({
        chargeId: id,
        homeId: home.id,
        tenantId: tenant.id,
        tenantName: tenant.name,
        chargeKind: "rent",
        amountCents: payment.amountCents,
        receivedAt: payment.receivedAt,
      });
    }
  }
}

seedIfNeeded();

/** Drop every demo charge and payment; the next read re-seeds the current month. */
export function resetDemoRent() {
  store.charges.clear();
}

export function listDemoCharges() {
  seedIfNeeded();
  return [...store.charges.values()].sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.address.localeCompare(b.address));
}

export function getDemoCharge(id: string) {
  seedIfNeeded();
  return store.charges.get(id) || null;
}

export function getDemoChargeByToken(payToken: string) {
  seedIfNeeded();
  return [...store.charges.values()].find((row) => row.payToken === payToken) || null;
}

export function createDemoCharge(input: {
  homeId: string;
  tenantId: string;
  kind?: RentCharge["kind"];
  amountCents: number;
  dueOn?: string;
  notes?: string;
}) {
  seedIfNeeded();
  const home = homes.find((row) => row.id === input.homeId);
  const tenant = tenants.find((row) => row.id === input.tenantId);
  if (!home || !tenant) return { error: "Tenant or home not found", status: 404 as const };
  const period = currentRentPeriod();
  const charge: RentCharge = {
    id: `chg-${token()}`,
    homeId: home.id,
    leaseId: `lease-${tenant.id}`,
    tenantId: tenant.id,
    tenantName: tenant.name,
    address: home.address,
    kind: input.kind || "rent",
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    dueOn: input.dueOn || period.dueOn,
    amountCents: input.amountCents,
    paidCents: 0,
    status: "due",
    payToken: token(),
    notes: input.notes || null,
    payments: [],
  };
  store.charges.set(charge.id, charge);
  return { charge };
}

function applyPayment(charge: RentCharge, payment: RentPayment) {
  charge.payments = [...charge.payments, payment];
  if (payment.status === "succeeded") {
    charge.paidCents += payment.amountCents;
    postDemoRentPayment({
      chargeId: charge.id,
      homeId: charge.homeId,
      tenantId: charge.tenantId,
      tenantName: charge.tenantName,
      chargeKind: charge.kind,
      amountCents: charge.paidCents,
      receivedAt: payment.receivedAt,
    });
  }
  charge.status = refreshChargeStatus(charge);
  return charge;
}

export function demoPaymentExists(stripePaymentIntentId: string) {
  seedIfNeeded();
  return [...store.charges.values()].some((charge) => charge.payments.some((row) => row.stripePaymentIntentId === stripePaymentIntentId));
}

export function payDemoCharge(payToken: string, input?: { method?: RentPayment["method"]; amountCents?: number; stripePaymentIntentId?: string | null }) {
  const charge = getDemoChargeByToken(payToken);
  if (!charge) return { error: "This pay link is not valid.", status: 404 as const };
  if (charge.status === "void") return { error: "This charge was voided.", status: 409 as const };
  if (input?.stripePaymentIntentId && charge.payments.some((row) => row.stripePaymentIntentId === input.stripePaymentIntentId)) {
    return { charge, payment: charge.payments.find((row) => row.stripePaymentIntentId === input.stripePaymentIntentId)!, duplicate: true };
  }
  const remaining = remainingCents(charge);
  if (remaining <= 0) return { error: "This charge is already paid.", status: 409 as const };
  const amount = Math.min(remaining, input?.amountCents || remaining);
  const payment: RentPayment = {
    id: `pmt-${token()}`,
    chargeId: charge.id,
    amountCents: amount,
    method: input?.method || "demo",
    status: "succeeded",
    stripePaymentIntentId: input?.stripePaymentIntentId || null,
    receivedAt: new Date().toISOString(),
  };
  applyPayment(charge, payment);
  return { charge, payment };
}

export function recordDemoOffline(id: string, input: { method: "cash" | "check" | "other"; amountCents?: number; notes?: string }) {
  const charge = getDemoCharge(id);
  if (!charge) return { error: "Charge not found", status: 404 as const };
  const remaining = remainingCents(charge);
  if (remaining <= 0) return { error: "This charge is already paid.", status: 409 as const };
  const payment: RentPayment = {
    id: `pmt-${token()}`,
    chargeId: charge.id,
    amountCents: Math.min(remaining, input.amountCents || remaining),
    method: input.method,
    status: "succeeded",
    receivedAt: new Date().toISOString(),
  };
  if (input.notes) charge.notes = input.notes;
  applyPayment(charge, payment);
  return { charge, payment };
}

export function failDemoCharge(id: string, reason: string) {
  const charge = getDemoCharge(id);
  if (!charge) return { error: "Charge not found", status: 404 as const };
  const payment: RentPayment = {
    id: `pmt-${token()}`,
    chargeId: charge.id,
    amountCents: remainingCents(charge),
    method: "stripe_ach",
    status: "failed",
    failureReason: reason,
    receivedAt: new Date().toISOString(),
  };
  applyPayment(charge, payment);
  return { charge, payment };
}
