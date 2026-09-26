import type { SupabaseClient } from "@supabase/supabase-js";
import { currentRentPeriod, refreshChargeStatus, type RentCharge, type RentPayment } from "@/lib/rent";

function mapPayment(row: any): RentPayment {
  return {
    id: row.id,
    chargeId: row.charge_id,
    amountCents: row.amount_cents,
    method: row.method,
    status: row.status,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    failureReason: row.failure_reason,
    receivedAt: row.received_at,
  };
}

export function mapCharge(row: any): RentCharge {
  const payments = (row.rent_payments ?? []).map(mapPayment);
  const charge: RentCharge = {
    id: row.id,
    homeId: row.home_id,
    leaseId: row.lease_id,
    tenantId: row.tenant_id,
    tenantName: row.tenants?.full_name || "Tenant",
    address: row.homes?.address1 || "Home",
    kind: row.kind,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    dueOn: row.due_on,
    amountCents: row.amount_cents,
    paidCents: row.paid_cents,
    status: row.status,
    payToken: row.pay_token,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    notes: row.notes,
    payments,
  };
  charge.status = refreshChargeStatus(charge);
  return charge;
}

export async function listLiveCharges(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from("rent_charges")
    .select("*, tenants(full_name, email), homes(address1, city, state), rent_payments(*)")
    .eq("organization_id", organizationId)
    .order("due_on", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCharge);
}

export async function getLiveChargeByToken(supabase: SupabaseClient, token: string) {
  const { data, error } = await supabase
    .from("rent_charges")
    .select("*, tenants(full_name, email), homes(address1, city, state), rent_payments(*)")
    .eq("pay_token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapCharge(data) : null;
}

export async function generateLivePeriodCharges(supabase: SupabaseClient, organizationId: string) {
  const period = currentRentPeriod();
  const { data: leases, error } = await supabase
    .from("leases")
    .select("id, home_id, tenant_id, rent_cents, status, tenants(full_name), homes(address1)")
    .eq("organization_id", organizationId)
    .eq("status", "active");
  if (error) throw new Error(error.message);
  const created: RentCharge[] = [];
  for (const lease of leases ?? []) {
    const { data: existing } = await supabase
      .from("rent_charges")
      .select("id")
      .eq("lease_id", lease.id)
      .eq("period_start", period.periodStart)
      .eq("kind", "rent")
      .maybeSingle();
    if (existing) continue;
    const { data, error: insertError } = await supabase.from("rent_charges").insert({
      organization_id: organizationId,
      home_id: lease.home_id,
      lease_id: lease.id,
      tenant_id: lease.tenant_id,
      kind: "rent",
      period_start: period.periodStart,
      period_end: period.periodEnd,
      due_on: period.dueOn,
      amount_cents: lease.rent_cents,
      status: "due",
    }).select("*, tenants(full_name), homes(address1), rent_payments(*)").single();
    if (insertError) throw new Error(insertError.message);
    created.push(mapCharge(data));
  }
  return created;
}

export async function listLiveChargesForTenant(supabase: SupabaseClient, tenantId: string) {
  const { data, error } = await supabase
    .from("rent_charges")
    .select("*, tenants(full_name, email), homes(address1, city, state), rent_payments(*)")
    .eq("tenant_id", tenantId)
    .order("due_on", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCharge);
}

export async function livePaymentExists(supabase: SupabaseClient, stripePaymentIntentId: string, status: RentPayment["status"] = "succeeded") {
  const { data } = await supabase
    .from("rent_payments")
    .select("id")
    .eq("stripe_payment_intent_id", stripePaymentIntentId)
    .eq("status", status)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

export async function recordLivePayment(
  supabase: SupabaseClient,
  organizationId: string,
  chargeId: string,
  input: {
    amountCents: number;
    method: RentPayment["method"];
    status: RentPayment["status"];
    stripePaymentIntentId?: string | null;
    stripeChargeId?: string | null;
    failureReason?: string | null;
  },
) {
  const { data: charge, error } = await supabase
    .from("rent_charges")
    .select("*, tenants(full_name), rent_payments(*)")
    .eq("id", chargeId)
    .eq("organization_id", organizationId)
    .single();
  if (error || !charge) throw new Error(error?.message || "Charge not found");
  const { error: payError } = await supabase.from("rent_payments").insert({
    organization_id: organizationId,
    charge_id: chargeId,
    amount_cents: input.amountCents,
    method: input.method,
    status: input.status,
    stripe_payment_intent_id: input.stripePaymentIntentId || null,
    stripe_charge_id: input.stripeChargeId || null,
    failure_reason: input.failureReason || null,
  });
  if (payError) throw new Error(payError.message);
  const paid = input.status === "succeeded" ? charge.paid_cents + input.amountCents : charge.paid_cents;
  const mapped = mapCharge({ ...charge, paid_cents: paid, rent_payments: [...(charge.rent_payments ?? []), { ...input, charge_id: chargeId, received_at: new Date().toISOString() }] });
  await supabase.from("rent_charges").update({
    paid_cents: paid,
    status: mapped.status,
    updated_at: new Date().toISOString(),
  }).eq("id", chargeId);
  if (input.status === "succeeded" && charge.lease_id) {
    const { data: lease } = await supabase.from("leases").select("balance_cents").eq("id", charge.lease_id).maybeSingle();
    if (lease) {
      await supabase.from("leases").update({
        balance_cents: Math.max(0, (lease.balance_cents || 0) - input.amountCents),
        updated_at: new Date().toISOString(),
      }).eq("id", charge.lease_id);
    }
  }
  if (input.status === "succeeded") {
    const { postLiveRentPayment } = await import("@/lib/books-live");
    await postLiveRentPayment(supabase, organizationId, {
      chargeId: charge.id,
      homeId: charge.home_id,
      tenantId: charge.tenant_id,
      tenantName: charge.tenants?.full_name || mapped.tenantName,
      chargeKind: charge.kind,
      amountCents: paid,
      receivedAt: new Date().toISOString(),
    });
  }
  return mapped;
}
