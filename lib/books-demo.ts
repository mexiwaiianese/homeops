import { homes, owners, tenants } from "@/lib/data";
import { currentRentPeriod } from "@/lib/rent";
import {
  BILL_KINDS,
  BOOK_KINDS,
  entryFromKind,
  kindFromCharge,
  type BookEntry,
  type BookKind,
  type BooksHome,
  type BooksOwner,
  type VendorBill,
} from "@/lib/books";

type Store = { entries: Map<string, BookEntry>; bills: Map<string, VendorBill> };

const store: Store =
  ((globalThis as typeof globalThis & { __homeopsBooks?: Store }).__homeopsBooks ??= {
    entries: new Map(),
    bills: new Map(),
  });

function token(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function booksHomes(): BooksHome[] {
  return homes.map((home) => {
    const [city, state] = home.city.split(",").map((part) => part.trim());
    return {
      id: home.id,
      address1: home.address,
      city: city || "Example City",
      state: state || "UT",
      ownerId: home.ownerId,
      tenantId: home.tenantId,
      reserveCents: Math.round(home.reserve * 100),
      property_code: home.address.replace(/[^A-Z0-9]+/gi, "-").toUpperCase(),
    };
  });
}

export function booksOwners(): BooksOwner[] {
  return owners.map((owner) => ({
    id: owner.id,
    name: owner.name,
    email: owner.email,
    reserveCents: Math.round(owner.reserve * 100),
    disbursementDay: parseInt(owner.disbursement, 10) || 10,
  }));
}

function addEntry(kind: BookKind, input: Omit<BookEntry, "kind" | "flowType" | "accountName" | "allocationStatus" | "matchConfidence" | "id"> & { id?: string }) {
  const entry = entryFromKind(kind, { ...input, id: input.id || token("bk") });
  store.entries.set(entry.id, entry);
  return entry;
}

function seedIfNeeded() {
  if (store.entries.size) return;
  const doors = booksHomes();
  const months = ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"];
  for (const date of months) {
    for (const home of doors) {
      const tenant = tenants.find((row) => row.id === home.tenantId);
      const skipCurrentUnpaid = date.startsWith("2026-09") && tenant?.balance;
      if (skipCurrentUnpaid) continue;
      addEntry("rent_income", {
        id: `bk-rent-${home.id}-${date.slice(0, 7)}`,
        txDate: date,
        amountCents: Math.round((homes.find((row) => row.id === home.id)?.rent || 0) * 100),
        homeId: home.id,
        ownerId: home.ownerId,
        tenantId: home.tenantId,
        vendorName: tenant?.name || "Tenant",
        description: `${new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "long" })} rent`,
        source: "rent",
        chargeId: date.startsWith("2026-09") ? `chg-${home.tenantId}-${date}` : null,
      });
    }
  }

  addEntry("hvac", { txDate: "2026-05-16", amountCents: 18900, homeId: "h1", ownerId: "o1", vendorName: "Demo Heating Co.", description: "Spring tune-up", source: "bill", billId: "bill-hvac-h1" });
  addEntry("plumbing", { txDate: "2026-06-10", amountCents: 48600, homeId: "h1", ownerId: "o1", vendorName: "Demo Plumbing Co.", description: "Water heater valve", source: "bill" });
  addEntry("capital", { txDate: "2026-06-14", amountCents: 312500, homeId: "h2", ownerId: "o1", vendorName: "Peak Roofing", description: "Storm repair / roof section", source: "bill" });
  addEntry("hoa", { txDate: "2026-06-20", amountCents: 19500, homeId: "h3", ownerId: "o2", vendorName: "Canyon HOA", description: "Quarterly dues", source: "bill" });
  addEntry("hvac", { txDate: "2026-07-07", amountCents: 168000, homeId: "h2", ownerId: "o1", vendorName: "Demo Heating Co.", description: "AC compressor repair", source: "bill" });
  addEntry("turnover", { txDate: "2026-07-12", amountCents: 94000, homeId: "h3", ownerId: "o2", vendorName: "Demo Home Services", description: "Paint and patch", source: "bill" });
  addEntry("repairs", { txDate: "2026-07-19", amountCents: 21800, homeId: "h1", ownerId: "o1", vendorName: "Home Supply Co.", description: "Maintenance supplies", source: "bill" });
  addEntry("landscaping", { txDate: "2026-08-06", amountCents: 18000, homeId: "h3", ownerId: "o2", vendorName: "GreenScape", description: "Monthly landscaping", source: "bill", billId: "bill-lawn-h3" });
  addEntry("overhead", { txDate: "2026-08-12", amountCents: 15900, homeId: null, ownerId: null, vendorName: "HomeOps Software", description: "Monthly operations software", source: "bill", billId: "bill-soft" });
  addEntry("plumbing", { txDate: "2026-08-16", amountCents: 32900, homeId: "h4", ownerId: "o3", vendorName: "Demo Plumbing Co.", description: "Drain clearing", source: "bill" });
  addEntry("owner_disbursement", { txDate: "2026-08-10", amountCents: 380000, homeId: null, ownerId: "o1", vendorName: "Demo Owner One", description: "August owner draw", source: "owner" });
  addEntry("owner_contribution", { txDate: "2026-06-02", amountCents: 100000, homeId: "h3", ownerId: "o2", vendorName: "Demo Owner Two", description: "Owner funds water heater reserve", source: "owner" });
  addEntry("management", { txDate: "2026-09-05", amountCents: 22500, homeId: "h1", ownerId: "o1", vendorName: "HomeOps Management", description: "September management fee", source: "bill", billId: "bill-mgmt-h1" });

  store.bills.set("bill-hvac-h1", { id: "bill-hvac-h1", homeId: "h1", ownerId: "o1", vendorId: "v1", vendorName: "Demo Heating Co.", kind: "hvac", amountCents: 18900, dueOn: "2026-05-16", status: "paid", paidAt: "2026-05-16T18:00:00.000Z", description: "Spring tune-up" });
  store.bills.set("bill-lawn-h3", { id: "bill-lawn-h3", homeId: "h3", ownerId: "o2", vendorName: "GreenScape", kind: "landscaping", amountCents: 18000, dueOn: "2026-08-06", status: "paid", paidAt: "2026-08-06T16:00:00.000Z", description: "Monthly landscaping" });
  store.bills.set("bill-soft", { id: "bill-soft", homeId: null, ownerId: null, vendorName: "HomeOps Software", kind: "overhead", amountCents: 15900, dueOn: "2026-08-12", status: "paid", paidAt: "2026-08-12T12:00:00.000Z", description: "Monthly operations software" });
  store.bills.set("bill-mgmt-h1", { id: "bill-mgmt-h1", homeId: "h1", ownerId: "o1", vendorName: "HomeOps Management", kind: "management", amountCents: 22500, dueOn: "2026-09-05", status: "paid", paidAt: "2026-09-05T14:00:00.000Z", description: "September management fee" });
  store.bills.set("bill-open-h3", { id: "bill-open-h3", homeId: "h3", ownerId: "o2", vendorId: "v2", vendorName: "Demo Plumbing Co.", kind: "plumbing", amountCents: 35000, dueOn: currentRentPeriod().periodEnd, status: "open", description: "Water heater parts — not yet paid" });
}

seedIfNeeded();

export function listDemoEntries() {
  seedIfNeeded();
  return [...store.entries.values()].sort((a, b) => b.txDate.localeCompare(a.txDate) || a.description.localeCompare(b.description));
}

export function syncDemoLedgerFromCharges(charges: Array<{
  id: string;
  homeId: string;
  tenantId: string;
  tenantName: string;
  kind?: string | null;
  payments: Array<{ status: string; amountCents: number; receivedAt: string }>;
}>) {
  seedIfNeeded();
  for (const charge of charges) {
    const succeeded = charge.payments.filter((payment) => payment.status === "succeeded");
    const paid = succeeded.reduce((sum, payment) => sum + payment.amountCents, 0);
    if (!paid) continue;
    postDemoRentPayment({
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

export function listDemoBills() {
  seedIfNeeded();
  return [...store.bills.values()].sort((a, b) => a.status.localeCompare(b.status) || a.dueOn.localeCompare(b.dueOn));
}

export function postDemoRentPayment(input: {
  chargeId: string;
  homeId: string;
  tenantId: string;
  tenantName: string;
  chargeKind?: string | null;
  amountCents: number;
  receivedAt: string;
}) {
  seedIfNeeded();
  const existing = [...store.entries.values()].find((row) => row.chargeId === input.chargeId);
  if (existing) {
    existing.amountCents = input.amountCents;
    existing.txDate = input.receivedAt.slice(0, 10);
    return existing;
  }
  const home = booksHomes().find((row) => row.id === input.homeId);
  return addEntry(kindFromCharge(input.chargeKind), {
    txDate: input.receivedAt.slice(0, 10),
    amountCents: input.amountCents,
    homeId: input.homeId,
    ownerId: home?.ownerId,
    tenantId: input.tenantId,
    vendorName: input.tenantName,
    description: `${BOOK_KINDS[kindFromCharge(input.chargeKind)].label} collected`,
    source: "rent",
    chargeId: input.chargeId,
  });
}

export function createDemoBill(input: {
  homeId?: string | null;
  vendorName: string;
  vendorId?: string | null;
  kind?: string;
  amountCents: number;
  dueOn?: string;
  description?: string;
  payNow?: boolean;
}) {
  seedIfNeeded();
  const kind = (BILL_KINDS.includes(input.kind as BookKind) ? input.kind : "repairs") as BookKind;
  const home = booksHomes().find((row) => row.id === input.homeId);
  const bill: VendorBill = {
    id: token("bill"),
    homeId: input.homeId || null,
    ownerId: home?.ownerId || null,
    vendorId: input.vendorId || null,
    vendorName: input.vendorName,
    kind,
    amountCents: input.amountCents,
    dueOn: input.dueOn || currentRentPeriod().periodEnd,
    status: "open",
    description: input.description || BOOK_KINDS[kind].label,
  };
  store.bills.set(bill.id, bill);
  if (input.payNow) return payDemoBill(bill.id);
  return { bill };
}

export function payDemoBill(id: string) {
  seedIfNeeded();
  const bill = store.bills.get(id);
  if (!bill) return { error: "Bill not found", status: 404 as const };
  if (bill.status === "void") return { error: "This bill was voided.", status: 409 as const };
  if (bill.status === "paid") return { bill, entry: [...store.entries.values()].find((row) => row.billId === id) || null };
  bill.status = "paid";
  bill.paidAt = new Date().toISOString();
  const entry = addEntry(bill.kind, {
    txDate: bill.paidAt.slice(0, 10),
    amountCents: bill.amountCents,
    homeId: bill.homeId,
    ownerId: bill.ownerId,
    vendorId: bill.vendorId,
    vendorName: bill.vendorName,
    description: bill.description,
    source: "bill",
    billId: bill.id,
  });
  return { bill, entry };
}

export function recordDemoOwnerMove(input: {
  ownerId: string;
  homeId?: string | null;
  kind: "owner_disbursement" | "owner_contribution";
  amountCents: number;
  notes?: string;
}) {
  seedIfNeeded();
  const owner = booksOwners().find((row) => row.id === input.ownerId);
  if (!owner) return { error: "Owner not found", status: 404 as const };
  const home = booksHomes().find((row) => row.id === input.homeId);
  const entry = addEntry(input.kind, {
    txDate: new Date().toISOString().slice(0, 10),
    amountCents: input.amountCents,
    homeId: home?.id || null,
    ownerId: owner.id,
    vendorName: owner.name,
    description: input.notes || BOOK_KINDS[input.kind].label,
    source: "owner",
  });
  return { entry };
}
