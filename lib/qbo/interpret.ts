import { BOOK_KINDS, type BookFlow, type BookKind } from "@/lib/books";
import { matchHome, normalize, type FinancialHome } from "@/lib/financial";

export const HOMEOPS_NOTE_PREFIX = "homeops:";

export type QboAlias = { home_id: string; alias_type: string; alias_value: string };
export type QboLookups = {
  accountNames: Map<string, string>;
  accountTypes: Map<string, string>;
  classNames: Map<string, string>;
};

export type InterpretedLine = {
  externalId: string;
  txDate: string;
  vendorName: string;
  description: string;
  memo: string;
  accountName: string;
  qbClass: string;
  qbLocation: string;
  qbCustomer: string;
  amountCents: number;
  flowType: BookFlow;
  kind: BookKind;
  cash: boolean;
  balanceCents: number;
};

type Ref = { name?: string; value?: string; Name?: string; Value?: string };
type QboRow = Record<string, any>;

export function refName(ref: Ref | null | undefined, names?: Map<string, string>) {
  if (!ref) return "";
  const named = ref.name || ref.Name || "";
  if (named) return named;
  const value = String(ref.value || ref.Value || "");
  return value ? names?.get(value) || "" : "";
}

export function dollarsToCentsExact(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

export function guessKind(text: string): BookKind {
  const n = text.toLowerCase();
  const rules: [RegExp, BookKind][] = [
    [/late fee/, "late_fee"],
    [/deposit (return|refund)|security deposit (return|refund)/, "deposit_return"],
    [/security deposit|tenant deposit/, "deposit_hold"],
    [/owner (draw|disburs|distribution)/, "owner_disbursement"],
    [/owner (contrib|funds)/, "owner_contribution"],
    [/hvac|heating|cooling|air condition/, "hvac"],
    [/plumb|drain/, "plumbing"],
    [/landscap|lawn|snow/, "landscaping"],
    [/turnover|make ready/, "turnover"],
    [/insur/, "insurance"],
    [/property tax|\btax/, "taxes"],
    [/hoa|association fee/, "hoa"],
    [/utilit|electric|water|sewer|trash|\bgas\b|internet/, "utilities"],
    [/management fee|property management/, "management"],
    [/capital|improv|renovat|roof|appliance/, "capital"],
    [/software|overhead|office|payroll|advert|bank charge/, "overhead"],
    [/rent/, "rent_income"],
  ];
  for (const [rule, kind] of rules) if (rule.test(n)) return kind;
  return "repairs";
}

export function interpretKind(text: string, direction: "in" | "out"): { kind: BookKind; flow: BookFlow } {
  const guessed = guessKind(text);
  const spec = BOOK_KINDS[guessed];
  if (spec.flow === "transfer") {
    const allowed = (guessed === "owner_contribution" || guessed === "deposit_hold") ? direction === "in" : direction === "out";
    if (allowed) return { kind: guessed, flow: "transfer" };
  }
  if (direction === "in") {
    if (spec.flow === "income") return { kind: guessed, flow: "income" };
    return { kind: "other_income", flow: "income" };
  }
  if (spec.flow === "expense") return { kind: guessed, flow: "expense" };
  return { kind: "repairs", flow: "expense" };
}

export function matchQboProperty(input: {
  homes: Array<FinancialHome & { owner_id?: string | null }>;
  aliases: QboAlias[];
  qbClass: string;
  qbLocation: string;
  qbCustomer: string;
  description: string;
  memo: string;
}) {
  const fields = [input.qbClass, input.qbLocation, input.qbCustomer, input.description, input.memo];
  const hay = fields.map(normalize);
  for (const alias of input.aliases) {
    const needle = normalize(alias.alias_value);
    if (needle.length < 3) continue;
    const hit = hay.some((value) => value === needle || (needle.length >= 5 && value.includes(needle)));
    if (hit) {
      return { propertyId: alias.home_id, confidence: 0.98, reason: `Matched QuickBooks ${alias.alias_type} “${alias.alias_value}” to a door` };
    }
  }
  const row = {
    class: input.qbClass,
    location: input.qbLocation,
    customer: input.qbCustomer,
    description: input.description,
    memo: input.memo,
  };
  return matchHome(row, {
    date: "date",
    qbClass: "class",
    qbLocation: "location",
    customerProject: "customer",
    description: "description",
    memo: "memo",
  }, input.homes);
}

function clip(value: unknown, max = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function lineId(row: QboRow, line: QboRow, index: number) {
  return `${row.Id}:${line.Id || index + 1}`;
}

function dated(row: QboRow) {
  const date = String(row.TxnDate || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

export function linesFromQboEntity(entity: string, row: QboRow, lookups: QboLookups): InterpretedLine[] {
  if (!row?.Id || row.status === "Deleted") return [];
  const note = String(row.PrivateNote || "");
  if (entity === "JournalEntry" && note.startsWith(HOMEOPS_NOTE_PREFIX)) return [];
  const txDate = dated(row);
  if (!txDate) return [];
  const memo = clip(note, 500);
  const customer = refName(row.CustomerRef);
  const vendor = refName(row.VendorRef) || refName(row.EntityRef);
  const lines = Array.isArray(row.Line) ? row.Line : [];

  if (entity === "Invoice" || entity === "Bill") {
    const balanceCents = dollarsToCentsExact(row.Balance == null ? row.TotalAmt : row.Balance);
    if (balanceCents <= 0) return [];
    const account = entity === "Bill"
      ? refName(lines.find((line: QboRow) => line.AccountBasedExpenseLineDetail)?.AccountBasedExpenseLineDetail?.AccountRef, lookups.accountNames) || "Bill"
      : "Invoice";
    const direction = entity === "Bill" ? "out" : "in";
    const text = [account, memo, customer, vendor, row.DocNumber].filter(Boolean).join(" ");
    const interpreted = asFlow(interpretKind(text, direction));
    const name = entity === "Bill" ? vendor : customer;
    return [baseLine({
      externalId: `qbo:${entity}:${row.Id}`,
      txDate,
      vendorName: name || entity,
      description: clip(`${entity} ${row.DocNumber || row.Id} still open in QuickBooks`),
      memo,
      accountName: account,
      amountCents: balanceCents,
      cash: false,
      balanceCents,
      ...pickClass(lines[0], lookups),
      ...interpreted,
    })];
  }

  if (entity === "Payment") {
    const amountCents = dollarsToCentsExact(row.TotalAmt);
    if (amountCents <= 0) return [];
    const text = [memo, customer, row.PaymentRefNum].filter(Boolean).join(" ");
    const interpreted = interpretKind(text, "in");
    const kind = asFlow(interpreted.kind === "other_income" ? { kind: "rent_income" as const, flow: "income" as const } : interpreted);
    return [baseLine({
      externalId: `qbo:Payment:${row.Id}`,
      txDate,
      vendorName: customer || "Customer payment",
      description: clip(memo || `Payment ${row.PaymentRefNum || row.Id}`),
      memo,
      accountName: BOOK_KINDS[kind.kind].account,
      qbClass: "",
      qbLocation: "",
      qbCustomer: customer,
      amountCents,
      cash: true,
      balanceCents: 0,
      ...kind,
    })];
  }

  if (entity === "BillPayment" || entity === "RefundReceipt") {
    const amountCents = dollarsToCentsExact(row.TotalAmt);
    if (amountCents <= 0) return [];
    const direction = "out" as const;
    const text = [vendor, customer, memo].filter(Boolean).join(" ");
    const interpreted = asFlow(interpretKind(text, direction));
    return [baseLine({
      externalId: `qbo:${entity}:${row.Id}`,
      txDate,
      vendorName: vendor || customer || entity,
      description: clip(memo || (entity === "RefundReceipt" ? "Refund" : "Bill payment")),
      memo,
      accountName: interpreted.kind === "repairs" && entity === "BillPayment" ? "Bill payment" : BOOK_KINDS[interpreted.kind].account,
      qbClass: "",
      qbLocation: "",
      qbCustomer: customer,
      amountCents,
      cash: true,
      balanceCents: 0,
      ...interpreted,
    })];
  }

  if (entity === "Purchase") return purchaseLines(row, txDate, memo, vendor, lookups);
  if (entity === "SalesReceipt") return salesReceiptLines(row, txDate, memo, customer, lookups);
  if (entity === "Deposit") return depositLines(row, txDate, memo, lookups);
  if (entity === "JournalEntry") return journalLines(row, txDate, memo, lookups);
  return [];
}

function purchaseLines(row: QboRow, txDate: string, memo: string, vendor: string, lookups: QboLookups) {
  const direction = row.Credit === true ? "in" as const : "out" as const;
  const usable = (Array.isArray(row.Line) ? row.Line : []).filter((line: QboRow) => (
    line.DetailType === "AccountBasedExpenseLineDetail" || line.DetailType === "ItemBasedExpenseLineDetail"
  ));
  const source = usable.length ? usable : [{ Id: "1", Amount: row.TotalAmt, Description: memo, DetailType: "AccountBasedExpenseLineDetail", AccountBasedExpenseLineDetail: {} }];
  return source.flatMap((line: QboRow, index: number) => {
    const detail = line.AccountBasedExpenseLineDetail || line.ItemBasedExpenseLineDetail || {};
    const accountName = refName(detail.AccountRef, lookups.accountNames) || refName(detail.ItemRef) || "Expense";
    const names = pickClass(line, lookups, detail);
    const text = [accountName, line.Description, names.qbClass, vendor, memo].filter(Boolean).join(" ");
    const interpreted = asFlow(interpretKind(text, direction));
    const amountCents = dollarsToCentsExact(line.Amount ?? row.TotalAmt);
    if (amountCents <= 0) return [];
    return [baseLine({
      externalId: `qbo:Purchase:${lineId(row, line, index)}`,
      txDate,
      vendorName: vendor || refName(row.EntityRef) || "QuickBooks expense",
      description: clip(line.Description || memo || accountName),
      memo,
      accountName,
      amountCents,
      cash: true,
      balanceCents: 0,
      ...names,
      ...interpreted,
    })];
  });
}

function salesReceiptLines(row: QboRow, txDate: string, memo: string, customer: string, lookups: QboLookups) {
  const usable = (Array.isArray(row.Line) ? row.Line : []).filter((line: QboRow) => line.DetailType === "SalesItemLineDetail");
  const source = usable.length ? usable : [{ Id: "1", Amount: row.TotalAmt, Description: memo, SalesItemLineDetail: {} }];
  return source.flatMap((line: QboRow, index: number) => {
    const detail = line.SalesItemLineDetail || {};
    const accountName = refName(detail.ItemRef) || "Sales";
    const names = pickClass(line, lookups, detail);
    const text = [accountName, line.Description, names.qbClass, customer, memo].filter(Boolean).join(" ");
    const interpreted = asFlow(interpretKind(text, "in"));
    const amountCents = dollarsToCentsExact(line.Amount ?? row.TotalAmt);
    if (amountCents <= 0) return [];
    return [baseLine({
      externalId: `qbo:SalesReceipt:${lineId(row, line, index)}`,
      txDate,
      vendorName: customer || "Customer",
      description: clip(line.Description || memo || accountName),
      memo,
      accountName,
      amountCents,
      cash: true,
      balanceCents: 0,
      ...names,
      ...interpreted,
    })];
  });
}

function depositLines(row: QboRow, txDate: string, memo: string, lookups: QboLookups) {
  const out: InterpretedLine[] = [];
  for (const [index, line] of (Array.isArray(row.Line) ? row.Line : []).entries()) {
    const linked = Array.isArray(line.LinkedTxn) ? line.LinkedTxn : [];
    if (linked.some((item: QboRow) => ["Payment", "SalesReceipt", "JournalEntry"].includes(String(item.TxnType)))) continue;
    const detail = line.DepositLineDetail || {};
    const accountName = refName(detail.AccountRef, lookups.accountNames) || "Deposit";
    const names = pickClass(line, lookups, detail);
    const entity = refName(detail.Entity?.EntityRef) || refName(detail.Entity);
    const text = [accountName, line.Description, names.qbClass, entity, memo].filter(Boolean).join(" ");
    const interpreted = asFlow(interpretKind(text, "in"));
    const amountCents = dollarsToCentsExact(line.Amount);
    if (amountCents <= 0) continue;
    out.push(baseLine({
      externalId: `qbo:Deposit:${lineId(row, line, index)}`,
      txDate,
      vendorName: entity || "Deposit",
      description: clip(line.Description || memo || accountName),
      memo,
      accountName,
      amountCents,
      cash: true,
      balanceCents: 0,
      ...names,
      qbCustomer: names.qbCustomer || entity,
      ...interpreted,
    }));
  }
  return out;
}

function journalLines(row: QboRow, txDate: string, memo: string, lookups: QboLookups) {
  const out: InterpretedLine[] = [];
  for (const [index, line] of (Array.isArray(row.Line) ? row.Line : []).entries()) {
    const detail = line.JournalEntryLineDetail;
    if (!detail) continue;
    const accountId = String(detail.AccountRef?.value || detail.AccountRef?.Value || "");
    const accountType = lookups.accountTypes.get(accountId) || "";
    const accountName = refName(detail.AccountRef, lookups.accountNames) || "Journal entry";
    const posting = String(detail.PostingType || "");
    const expense = accountType === "Expense" || accountType === "Other Expense" || accountType === "Cost of Goods Sold";
    const income = accountType === "Income" || accountType === "Other Income";
    if (!expense && !income) continue;
    const direction = (expense && posting === "Credit") || (income && posting === "Debit") ? "in" : "out";
    const names = pickClass(line, lookups, detail);
    const text = [accountName, line.Description, names.qbClass, memo].filter(Boolean).join(" ");
    const interpreted = asFlow(expense && posting === "Credit"
      ? { kind: "other_income" as const, flow: "income" as const }
      : income && posting === "Debit"
        ? { kind: "repairs" as const, flow: "expense" as const }
        : interpretKind(text, direction));
    const amountCents = dollarsToCentsExact(line.Amount);
    if (amountCents <= 0) continue;
    out.push(baseLine({
      externalId: `qbo:JournalEntry:${lineId(row, line, index)}`,
      txDate,
      vendorName: refName(detail.Entity?.EntityRef) || accountName,
      description: clip(line.Description || memo || accountName),
      memo,
      accountName,
      amountCents,
      cash: true,
      balanceCents: 0,
      ...names,
      ...interpreted,
    }));
  }
  return out;
}

function pickClass(line: QboRow | undefined, lookups: QboLookups, detail?: QboRow) {
  const source = detail || line?.AccountBasedExpenseLineDetail || line?.DepositLineDetail || line?.JournalEntryLineDetail || line?.SalesItemLineDetail || {};
  return {
    qbClass: refName(source.ClassRef, lookups.classNames),
    qbLocation: refName(source.DepartmentRef),
    qbCustomer: refName(source.CustomerRef),
  };
}

function asFlow(input: { kind: BookKind; flow: BookFlow }) {
  return { kind: input.kind, flowType: input.flow };
}

function baseLine(input: InterpretedLine): InterpretedLine {
  return {
    ...input,
    vendorName: clip(input.vendorName, 160),
    description: clip(input.description, 400) || input.accountName,
    accountName: clip(input.accountName, 160) || BOOK_KINDS[input.kind].account,
  };
}
