import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOK_KINDS, entryFromKind, isBookKind, kindFromCharge, type BookEntry, type BookKind, type BookSource, type VendorBill } from "@/lib/books";

function mapEntry(row: any): BookEntry {
  const rawKind = String(row.kind || "");
  const kind: BookKind = isBookKind(rawKind)
    ? rawKind
    : row.flow_type === "income"
      ? "rent_income"
      : row.allocation_status === "overhead"
        ? "overhead"
        : "repairs";
  return {
    id: row.id,
    txDate: row.tx_date,
    kind,
    flowType: row.flow_type,
    amountCents: row.amount_cents,
    homeId: row.property_id,
    ownerId: row.owner_id,
    tenantId: row.tenant_id,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    description: row.description || BOOK_KINDS[kind].label,
    allocationStatus: row.allocation_status === "split" ? "review" : row.allocation_status,
    source: (row.source || "quickbooks_csv") as BookSource,
    chargeId: row.charge_id,
    billId: row.bill_id,
    accountName: row.account_name || BOOK_KINDS[kind].account,
    matchConfidence: Number(row.match_confidence || 1),
  };
}

function mapBill(row: any): VendorBill {
  return {
    id: row.id,
    homeId: row.home_id,
    ownerId: row.owner_id,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    kind: row.kind,
    amountCents: row.amount_cents,
    dueOn: row.due_on,
    status: row.status,
    paidAt: row.paid_at,
    description: row.description,
    maintenanceRequestId: row.maintenance_request_id,
  };
}

function toRow(organizationId: string, entry: BookEntry) {
  return {
    organization_id: organizationId,
    tx_date: entry.txDate,
    vendor_name: entry.vendorName,
    description: entry.description,
    account_name: entry.accountName,
    amount_cents: entry.amountCents,
    flow_type: entry.flowType,
    property_id: entry.homeId || null,
    allocation_status: entry.allocationStatus,
    normalized_category: entry.accountName,
    match_confidence: 1,
    match_reason: "Posted from HomeOps books",
    source: entry.source,
    kind: entry.kind,
    owner_id: entry.ownerId || null,
    tenant_id: entry.tenantId || null,
    vendor_id: entry.vendorId || null,
    charge_id: entry.chargeId || null,
    bill_id: entry.billId || null,
  };
}

export async function listLiveEntries(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from("financial_transactions")
    .select("*")
    .eq("organization_id", organizationId)
    .order("tx_date", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapEntry);
}

export async function listLiveBills(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from("vendor_bills")
    .select("*")
    .eq("organization_id", organizationId)
    .order("due_on", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapBill);
}

export async function postLiveRentPayment(
  supabase: SupabaseClient,
  organizationId: string,
  input: {
    chargeId: string;
    homeId: string;
    tenantId: string;
    tenantName: string;
    chargeKind?: string | null;
    amountCents: number;
    receivedAt: string;
  },
) {
  const { data: existing } = await supabase
    .from("financial_transactions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("charge_id", input.chargeId)
    .maybeSingle();
  if (existing) {
    await supabase.from("financial_transactions").update({
      amount_cents: input.amountCents,
      tx_date: input.receivedAt.slice(0, 10),
      vendor_name: input.tenantName,
    }).eq("id", existing.id);
    return;
  }
  const { data: home } = await supabase.from("homes").select("id, owner_id").eq("id", input.homeId).maybeSingle();
  const kind = kindFromCharge(input.chargeKind);
  const entry = entryFromKind(kind, {
    id: "pending",
    txDate: input.receivedAt.slice(0, 10),
    amountCents: input.amountCents,
    homeId: input.homeId,
    ownerId: home?.owner_id,
    tenantId: input.tenantId,
    vendorName: input.tenantName,
    description: `${BOOK_KINDS[kind].label} collected`,
    source: "rent",
    chargeId: input.chargeId,
  });
  const { error } = await supabase.from("financial_transactions").insert(toRow(organizationId, entry));
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
}

export async function syncLiveLedgerFromCharges(
  supabase: SupabaseClient,
  organizationId: string,
  charges: Array<{
    id: string;
    homeId: string;
    tenantId: string;
    tenantName: string;
    kind?: string | null;
    payments: Array<{ status: string; amountCents: number; receivedAt: string }>;
  }>,
) {
  for (const charge of charges) {
    const succeeded = charge.payments.filter((payment) => payment.status === "succeeded");
    const paid = succeeded.reduce((sum, payment) => sum + payment.amountCents, 0);
    if (!paid) continue;
    await postLiveRentPayment(supabase, organizationId, {
      chargeId: charge.id,
      homeId: charge.homeId,
      tenantId: charge.tenantId,
      tenantName: charge.tenantName,
      chargeKind: charge.kind,
      amountCents: paid,
      receivedAt: succeeded[succeeded.length - 1]?.receivedAt || new Date().toISOString(),
    });
  }
}

export async function createLiveBill(
  supabase: SupabaseClient,
  organizationId: string,
  input: {
    homeId?: string | null;
    vendorName: string;
    vendorId?: string | null;
    kind: BookKind;
    amountCents: number;
    dueOn: string;
    description?: string;
    payNow?: boolean;
  },
) {
  const { data: home } = input.homeId
    ? await supabase.from("homes").select("owner_id").eq("id", input.homeId).maybeSingle()
    : { data: null };
  const { data, error } = await supabase.from("vendor_bills").insert({
    organization_id: organizationId,
    home_id: input.homeId || null,
    owner_id: home?.owner_id || null,
    vendor_id: input.vendorId || null,
    vendor_name: input.vendorName,
    kind: input.kind,
    amount_cents: input.amountCents,
    due_on: input.dueOn,
    description: input.description || BOOK_KINDS[input.kind].label,
    status: "open",
  }).select("*").single();
  if (error) throw new Error(error.message);
  const bill = mapBill(data);
  if (input.payNow) return payLiveBill(supabase, organizationId, bill.id);
  return { bill };
}

export async function payLiveBill(supabase: SupabaseClient, organizationId: string, id: string) {
  const { data: billRow, error } = await supabase
    .from("vendor_bills")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organizationId)
    .single();
  if (error || !billRow) throw new Error(error?.message || "Bill not found");
  const bill = mapBill(billRow);
  if (bill.status === "void") throw new Error("This bill was voided.");
  if (bill.status !== "paid") {
    const paidAt = new Date().toISOString();
    const { error: updateError } = await supabase.from("vendor_bills").update({
      status: "paid",
      paid_at: paidAt,
      updated_at: paidAt,
    }).eq("id", id);
    if (updateError) throw new Error(updateError.message);
    bill.status = "paid";
    bill.paidAt = paidAt;
  }
  const { data: posted } = await supabase
    .from("financial_transactions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("bill_id", id)
    .maybeSingle();
  if (!posted) {
    const entry = entryFromKind(bill.kind, {
      id: "pending",
      txDate: (bill.paidAt || new Date().toISOString()).slice(0, 10),
      amountCents: bill.amountCents,
      homeId: bill.homeId,
      ownerId: bill.ownerId,
      vendorId: bill.vendorId,
      vendorName: bill.vendorName,
      description: bill.description,
      source: "bill",
      billId: bill.id,
    });
    const { error: postError } = await supabase.from("financial_transactions").insert(toRow(organizationId, entry));
    if (postError && !/duplicate|unique/i.test(postError.message)) throw new Error(postError.message);
  }
  return { bill };
}

export async function recordLiveOwnerMove(
  supabase: SupabaseClient,
  organizationId: string,
  input: { ownerId: string; homeId?: string | null; kind: "owner_disbursement" | "owner_contribution"; amountCents: number; notes?: string },
) {
  const { data: owner } = await supabase.from("owners").select("id, full_name").eq("id", input.ownerId).eq("organization_id", organizationId).maybeSingle();
  if (!owner) throw new Error("Owner not found");
  const entry = entryFromKind(input.kind, {
    id: "pending",
    txDate: new Date().toISOString().slice(0, 10),
    amountCents: input.amountCents,
    homeId: input.homeId || null,
    ownerId: owner.id,
    vendorName: owner.full_name,
    description: input.notes || BOOK_KINDS[input.kind].label,
    source: "owner",
  });
  const { data, error } = await supabase.from("financial_transactions").insert(toRow(organizationId, entry)).select("*").single();
  if (error) throw new Error(error.message);
  return { entry: mapEntry(data) };
}
