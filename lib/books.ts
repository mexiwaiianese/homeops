export type BookSource = "homeops" | "rent" | "bill" | "owner" | "quickbooks_csv";
export type BookFlow = "income" | "expense" | "transfer";
export type BookKind =
  | "rent_income"
  | "late_fee"
  | "other_income"
  | "deposit_hold"
  | "deposit_return"
  | "repairs"
  | "hvac"
  | "plumbing"
  | "landscaping"
  | "turnover"
  | "insurance"
  | "taxes"
  | "hoa"
  | "utilities"
  | "management"
  | "capital"
  | "owner_contribution"
  | "owner_disbursement"
  | "overhead";

export const BOOK_KINDS: Record<BookKind, { label: string; flow: BookFlow; expenseClass: "Operating" | "Capital" | "Transfer" | "Income" | "Overhead"; account: string }> = {
  rent_income: { label: "Rent", flow: "income", expenseClass: "Income", account: "Rental Income" },
  late_fee: { label: "Late fee", flow: "income", expenseClass: "Income", account: "Late fees" },
  other_income: { label: "Other tenant charge", flow: "income", expenseClass: "Income", account: "Other income" },
  deposit_hold: { label: "Security deposit held", flow: "transfer", expenseClass: "Transfer", account: "Security deposits" },
  deposit_return: { label: "Deposit returned", flow: "transfer", expenseClass: "Transfer", account: "Security deposits" },
  repairs: { label: "Repairs & maintenance", flow: "expense", expenseClass: "Operating", account: "Repairs & maintenance" },
  hvac: { label: "HVAC", flow: "expense", expenseClass: "Operating", account: "HVAC" },
  plumbing: { label: "Plumbing", flow: "expense", expenseClass: "Operating", account: "Plumbing" },
  landscaping: { label: "Landscaping", flow: "expense", expenseClass: "Operating", account: "Landscaping" },
  turnover: { label: "Turnover", flow: "expense", expenseClass: "Operating", account: "Turnover" },
  insurance: { label: "Insurance", flow: "expense", expenseClass: "Operating", account: "Insurance" },
  taxes: { label: "Property taxes", flow: "expense", expenseClass: "Operating", account: "Property taxes" },
  hoa: { label: "HOA", flow: "expense", expenseClass: "Operating", account: "HOA" },
  utilities: { label: "Utilities", flow: "expense", expenseClass: "Operating", account: "Utilities" },
  management: { label: "Management fee", flow: "expense", expenseClass: "Operating", account: "Management fees" },
  capital: { label: "Capital improvement", flow: "expense", expenseClass: "Capital", account: "Capital improvements" },
  owner_contribution: { label: "Owner contribution", flow: "transfer", expenseClass: "Transfer", account: "Owner contributions" },
  owner_disbursement: { label: "Owner disbursement", flow: "transfer", expenseClass: "Transfer", account: "Owner disbursements" },
  overhead: { label: "Company overhead", flow: "expense", expenseClass: "Overhead", account: "Software" },
};

export const BILL_KINDS = (Object.keys(BOOK_KINDS) as BookKind[]).filter((kind) => BOOK_KINDS[kind].flow === "expense");

export type BookEntry = {
  id: string;
  txDate: string;
  kind: BookKind;
  flowType: BookFlow;
  amountCents: number;
  homeId?: string | null;
  ownerId?: string | null;
  tenantId?: string | null;
  vendorId?: string | null;
  vendorName?: string | null;
  description: string;
  allocationStatus: "matched" | "review" | "overhead";
  source: BookSource;
  chargeId?: string | null;
  billId?: string | null;
  accountName: string;
  matchConfidence: number;
};

export type VendorBill = {
  id: string;
  homeId?: string | null;
  ownerId?: string | null;
  vendorId?: string | null;
  vendorName: string;
  kind: BookKind;
  amountCents: number;
  dueOn: string;
  status: "open" | "paid" | "void";
  paidAt?: string | null;
  description: string;
  maintenanceRequestId?: string | null;
};

export type BooksHome = {
  id: string;
  address1: string;
  city: string;
  state: string;
  ownerId: string;
  tenantId?: string;
  reserveCents: number;
  property_code?: string | null;
};

export type BooksOwner = {
  id: string;
  name: string;
  email?: string;
  reserveCents: number;
  disbursementDay: number;
};

export function kindFromCharge(chargeKind?: string | null): BookKind {
  if (chargeKind === "deposit") return "deposit_hold";
  if (chargeKind === "late_fee") return "late_fee";
  if (chargeKind === "other") return "other_income";
  return "rent_income";
}

export function isBookKind(value: string): value is BookKind {
  return value in BOOK_KINDS;
}

export function entryFromKind(kind: BookKind, input: Omit<BookEntry, "kind" | "flowType" | "accountName" | "allocationStatus" | "matchConfidence"> & { allocationStatus?: BookEntry["allocationStatus"] }): BookEntry {
  const meta = BOOK_KINDS[kind];
  const overhead = kind === "overhead" || !input.homeId;
  return {
    ...input,
    kind,
    flowType: meta.flow,
    accountName: meta.account,
    allocationStatus: input.allocationStatus || (overhead && meta.flow === "expense" ? "overhead" : input.homeId ? "matched" : "review"),
    matchConfidence: 1,
  };
}

export function inPeriod(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

export function buildOwnerStatements(input: {
  owners: BooksOwner[];
  homes: BooksHome[];
  entries: BookEntry[];
  periodStart: string;
  periodEnd: string;
}) {
  return input.owners.map((owner) => {
    const doors = input.homes.filter((home) => home.ownerId === owner.id);
    const doorIds = new Set(doors.map((home) => home.id));
    const rows = input.entries.filter((row) => {
      if (!inPeriod(row.txDate, input.periodStart, input.periodEnd)) return false;
      if (row.ownerId === owner.id) return true;
      return Boolean(row.homeId && doorIds.has(row.homeId));
    });
    const income = rows.filter((row) => row.flowType === "income").reduce((sum, row) => sum + row.amountCents, 0);
    const operating = rows.filter((row) => row.flowType === "expense" && BOOK_KINDS[row.kind].expenseClass === "Operating").reduce((sum, row) => sum + row.amountCents, 0);
    const capital = rows.filter((row) => row.kind === "capital").reduce((sum, row) => sum + row.amountCents, 0);
    const overhead = rows.filter((row) => row.kind === "overhead").reduce((sum, row) => sum + row.amountCents, 0);
    const contributions = rows.filter((row) => row.kind === "owner_contribution").reduce((sum, row) => sum + row.amountCents, 0);
    const disbursed = rows.filter((row) => row.kind === "owner_disbursement").reduce((sum, row) => sum + row.amountCents, 0);
    const noi = income - operating;
    const cashAvailable = noi - capital + contributions;
    const dueToOwner = Math.max(0, cashAvailable - disbursed);
    const reserveFloor = owner.reserveCents || doors.reduce((sum, home) => sum + home.reserveCents, 0);
    const belowReserve = dueToOwner > 0 && dueToOwner < reserveFloor;
    return {
      owner,
      doors,
      rows,
      income,
      operating,
      capital,
      overhead,
      contributions,
      disbursed,
      noi,
      cashAvailable,
      dueToOwner,
      reserveFloor,
      belowReserve,
    };
  });
}

export type TenantLedger = {
  tenantId: string;
  name: string;
  address: string;
  charged: number;
  paid: number;
  remaining: number;
  depositsHeld: number;
};

export function buildTenantLedgers(input: {
  charges: Array<{
    tenantId: string;
    tenantName: string;
    address: string;
    amountCents: number;
    paidCents: number;
    remainingCents?: number;
    kind?: string;
  }>;
  entries: BookEntry[];
}): TenantLedger[] {
  const ledgers = new Map<string, TenantLedger>();
  for (const charge of input.charges) {
    const current = ledgers.get(charge.tenantId) || {
      tenantId: charge.tenantId,
      name: charge.tenantName,
      address: charge.address,
      charged: 0,
      paid: 0,
      remaining: 0,
      depositsHeld: 0,
    };
    current.charged += charge.amountCents;
    current.paid += charge.paidCents;
    current.remaining += charge.remainingCents ?? Math.max(0, charge.amountCents - charge.paidCents);
    ledgers.set(charge.tenantId, current);
  }
  for (const entry of input.entries) {
    if (!entry.tenantId) continue;
    const current = ledgers.get(entry.tenantId);
    if (!current) continue;
    if (entry.kind === "deposit_hold") current.depositsHeld += entry.amountCents;
    if (entry.kind === "deposit_return") current.depositsHeld = Math.max(0, current.depositsHeld - entry.amountCents);
  }
  return [...ledgers.values()].sort((a, b) => a.address.localeCompare(b.address) || a.name.localeCompare(b.name));
}

export function intelligenceRows(entries: BookEntry[], homes: BooksHome[]) {
  return entries
    .filter((row) => row.flowType !== "transfer")
    .map((row) => {
      const home = homes.find((item) => item.id === row.homeId) || null;
      return {
        id: row.id,
        tx_date: row.txDate,
        vendor_name: row.vendorName,
        description: row.description,
        account_name: row.accountName,
        amount_cents: row.amountCents,
        flow_type: row.flowType === "transfer" ? "expense" : row.flowType,
        allocation_status: row.allocationStatus,
        match_confidence: row.matchConfidence,
        property_id: row.homeId || null,
        homes: home ? { id: home.id, address1: home.address1, city: home.city, state: home.state, property_code: home.property_code } : null,
        kind: row.kind,
        source: row.source,
      };
    });
}
