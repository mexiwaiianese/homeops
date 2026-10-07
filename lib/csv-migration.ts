import { BOOK_KINDS, type BookKind } from "@/lib/books";
import { dollarsToCents, normalize } from "@/lib/financial";

export const MIGRATION_FIELDS = [
  { key: "address", label: "Property address" },
  { key: "propertyLabel", label: "Property label" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "postal", label: "Postal code" },
  { key: "rent", label: "Monthly rent" },
  { key: "tenant", label: "Tenant name" },
  { key: "tenantEmail", label: "Tenant email" },
  { key: "tenantPhone", label: "Tenant phone" },
  { key: "date", label: "Transaction date" },
  { key: "amount", label: "Amount" },
  { key: "debit", label: "Debit" },
  { key: "credit", label: "Credit" },
  { key: "flow", label: "Income or expense" },
  { key: "vendor", label: "Vendor / payee" },
  { key: "trade", label: "Vendor trade" },
  { key: "account", label: "Account / category" },
  { key: "description", label: "Description" },
  { key: "memo", label: "Memo" },
] as const;

export type MigrationField = (typeof MIGRATION_FIELDS)[number]["key"];
export type MigrationMapping = Record<MigrationField, string>;

const SYNONYMS: Record<MigrationField, string[]> = {
  address: ["property_address", "property address", "address1", "street address", "street", "address"],
  propertyLabel: ["property label", "property name", "class", "location", "customer", "project"],
  city: ["city"],
  state: ["state"],
  postal: ["postal_code", "postal code", "postal", "zip code", "zip"],
  rent: ["monthly_rent", "monthly rent", "rent"],
  tenant: ["tenant_name", "tenant name", "resident name", "resident", "tenant"],
  tenantEmail: ["tenant_email", "tenant email", "resident email"],
  tenantPhone: ["tenant_phone", "tenant phone", "resident phone"],
  date: ["transaction_date", "transaction date", "tx_date", "txn date", "date"],
  amount: ["amount"],
  debit: ["debit"],
  credit: ["credit"],
  flow: ["income or expense", "flow", "type"],
  vendor: ["vendor_name", "vendor name", "payee", "vendor"],
  trade: ["vendor trade", "trade", "service"],
  account: ["account", "category"],
  description: ["description"],
  memo: ["memo", "notes"],
};

const FIELD_ORDER: MigrationField[] = [
  "tenantEmail",
  "tenantPhone",
  "tenant",
  "address",
  "propertyLabel",
  "postal",
  "city",
  "state",
  "rent",
  "date",
  "debit",
  "credit",
  "amount",
  "flow",
  "vendor",
  "trade",
  "account",
  "description",
  "memo",
];

export type MigrationInsight = {
  tone: "money" | "efficiency" | "operations";
  title: string;
  detail: string;
};

export type PlannedRow = {
  index: number;
  address: string;
  city: string;
  state: string;
  postal: string;
  rentCents: number;
  tenant: string;
  tenantEmail: string;
  tenantPhone: string;
  date: string | null;
  amountCents: number;
  flow: "income" | "expense" | null;
  vendor: string;
  trade: string;
  account: string;
  description: string;
  notes: string;
  kind: BookKind | null;
};

export type MigrationPlan = {
  rows: PlannedRow[];
  homes: number;
  tenants: number;
  vendors: number;
  transactions: number;
  unmapped: string[];
  insights: MigrationInsight[];
};

export function emptyMapping(): MigrationMapping {
  return {
    address: "",
    propertyLabel: "",
    city: "",
    state: "",
    postal: "",
    rent: "",
    tenant: "",
    tenantEmail: "",
    tenantPhone: "",
    date: "",
    amount: "",
    debit: "",
    credit: "",
    flow: "",
    vendor: "",
    trade: "",
    account: "",
    description: "",
    memo: "",
  };
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }
  const headers = (rows.shift() || []).map((value) => value.trim()).filter(Boolean);
  return {
    headers,
    rows: rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))),
  };
}

function headerKey(value: string) {
  return value.toLowerCase().replace(/[_/]+/g, " ").replace(/\s+/g, " ").trim();
}

export function suggestMapping(headers: string[]): MigrationMapping {
  const mapping = emptyMapping();
  const used = new Set<string>();
  for (const field of FIELD_ORDER) {
    const match = headers.find((header) => {
      if (used.has(header)) return false;
      const key = headerKey(header);
      return SYNONYMS[field].some((synonym) => key === synonym || (synonym.length > 4 && key.includes(synonym)));
    });
    if (match) {
      mapping[field] = match;
      used.add(match);
    }
  }
  return mapping;
}

export function unmappedHeaders(headers: string[], mapping: MigrationMapping) {
  const used = new Set(Object.values(mapping).filter(Boolean));
  return headers.filter((header) => header && !used.has(header));
}

export function parseTxDate(value: string) {
  const raw = value.trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!us) return null;
  const year = us[3].length === 2 ? `20${us[3]}` : us[3];
  return `${year}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
}

function cell(row: Record<string, string>, header: string) {
  return header ? String(row[header] ?? "").trim() : "";
}

function notesFor(row: Record<string, string>, mapping: MigrationMapping, extras: string[]) {
  const lines = extras
    .map((header) => {
      const value = cell(row, header);
      return value ? `${header}: ${value}` : "";
    })
    .filter(Boolean);
  const memo = cell(row, mapping.memo);
  if (memo) lines.unshift(memo);
  return lines.join("\n");
}

function flowFor(row: Record<string, string>, mapping: MigrationMapping): { amountCents: number; flow: "income" | "expense" | null } {
  const labeled = cell(row, mapping.flow).toLowerCase();
  const hasAmount = Boolean(mapping.amount || mapping.debit || mapping.credit);
  if (!hasAmount && !labeled) return { amountCents: 0, flow: null };
  if (labeled) {
    const income = /income|rent|credit|deposit/.test(labeled) && !/expense/.test(labeled);
    const source = mapping.amount || mapping.debit || mapping.credit;
    const amountCents = Math.abs(dollarsToCents(cell(row, source)));
    if (!amountCents) return { amountCents: 0, flow: null };
    return { amountCents, flow: income ? "income" : "expense" };
  }
  let signed = 0;
  if (mapping.amount) signed = dollarsToCents(cell(row, mapping.amount));
  else {
    const debit = mapping.debit ? Math.abs(dollarsToCents(cell(row, mapping.debit))) : 0;
    const credit = mapping.credit ? Math.abs(dollarsToCents(cell(row, mapping.credit))) : 0;
    signed = debit - credit;
  }
  if (!signed) return { amountCents: 0, flow: null };
  const account = `${cell(row, mapping.account)} ${cell(row, mapping.description)}`;
  const income = signed > 0 && /rent|income/.test(account);
  return { amountCents: Math.abs(signed), flow: income || signed < 0 ? "income" : "expense" };
}

export function kindFor(flow: "income" | "expense", account: string, description: string): BookKind {
  const text = `${account} ${description}`;
  if (flow === "income") {
    if (/late/i.test(text)) return "late_fee";
    if (/rent/i.test(text)) return "rent_income";
    return "other_income";
  }
  if (/plumb|drain/i.test(text)) return "plumbing";
  if (/hvac|heat|cool|furnace|air condition/i.test(text)) return "hvac";
  if (/landscap|lawn|snow|yard/i.test(text)) return "landscaping";
  if (/turnover|make ready|carpet|paint/i.test(text)) return "turnover";
  if (/hoa|association/i.test(text)) return "hoa";
  if (/tax/i.test(text)) return "taxes";
  if (/insur/i.test(text)) return "insurance";
  if (/utilit|electric|gas|water|sewer/i.test(text)) return "utilities";
  if (/management fee|property management/i.test(text)) return "management";
  if (/roof|foundation|remodel|capital|replacement/i.test(text)) return "capital";
  if (/software|subscription/i.test(text)) return "overhead";
  return "repairs";
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export function buildMigrationPlan(rows: Record<string, string>[], mapping: MigrationMapping, headers: string[], notesOverride?: string[]): MigrationPlan {
  const extras = unmappedHeaders(headers, mapping);
  const planned: PlannedRow[] = rows.map((row, index) => {
    const address = cell(row, mapping.address) || cell(row, mapping.propertyLabel);
    const account = cell(row, mapping.account);
    const description = cell(row, mapping.description);
    const amount = flowFor(row, mapping);
    const vendor = cell(row, mapping.vendor);
    const tenant = cell(row, mapping.tenant);
    return {
      index,
      address,
      city: cell(row, mapping.city),
      state: cell(row, mapping.state),
      postal: cell(row, mapping.postal),
      rentCents: Math.abs(dollarsToCents(cell(row, mapping.rent))),
      tenant,
      tenantEmail: cell(row, mapping.tenantEmail),
      tenantPhone: cell(row, mapping.tenantPhone),
      date: parseTxDate(cell(row, mapping.date)),
      amountCents: amount.amountCents,
      flow: amount.flow,
      vendor,
      trade: cell(row, mapping.trade),
      account,
      description,
      notes: notesOverride?.[index] ?? notesFor(row, mapping, extras),
      kind: amount.flow ? kindFor(amount.flow, account || vendor, description) : null,
    };
  });

  const homeKeys = new Set(planned.map((row) => normalize(row.address)).filter((key) => key.length >= 5));
  const tenantKeys = new Set(
    planned
      .filter((row) => row.tenant)
      .map((row) => row.tenantEmail.toLowerCase() || `${normalize(row.tenant)}|${normalize(row.address)}`),
  );
  const vendorKeys = new Set(
    planned
      .filter((row) => row.flow === "expense" && row.vendor && normalize(row.vendor) !== normalize(row.tenant))
      .map((row) => normalize(row.vendor)),
  );
  const transactions = planned.filter((row) => row.date && row.flow && row.amountCents > 0).length;
  return {
    rows: planned,
    homes: homeKeys.size,
    tenants: tenantKeys.size,
    vendors: vendorKeys.size,
    transactions,
    unmapped: extras,
    insights: migrationInsights(planned),
  };
}

function migrationInsights(rows: PlannedRow[]): MigrationInsight[] {
  const expenses = rows.filter((row) => row.flow === "expense" && row.amountCents > 0);
  const moneyInsights: Array<MigrationInsight & { score: number }> = [];
  const efficiency: Array<MigrationInsight & { score: number }> = [];
  const operations: Array<MigrationInsight & { score: number }> = [];

  const byTrade = new Map<string, PlannedRow[]>();
  expenses.forEach((row) => {
    const trade = row.kind && row.kind !== "repairs" ? BOOK_KINDS[row.kind].label : row.trade || row.account || "Repairs";
    byTrade.set(trade, [...(byTrade.get(trade) || []), row]);
  });
  for (const [trade, tradeRows] of byTrade) {
    const byVendor = new Map<string, PlannedRow[]>();
    tradeRows.forEach((row) => {
      if (!row.vendor) return;
      byVendor.set(row.vendor, [...(byVendor.get(row.vendor) || []), row]);
    });
    const averages = [...byVendor].map(([name, vendorRows]) => ({
      name,
      count: vendorRows.length,
      average: vendorRows.reduce((sum, row) => sum + row.amountCents, 0) / vendorRows.length,
    }));
    if (averages.length < 2) continue;
    const low = [...averages].sort((a, b) => a.average - b.average)[0];
    const high = [...averages].filter((vendor) => vendor.count >= 2).sort((a, b) => b.average - a.average)[0];
    if (!high || high.average <= low.average * 1.5) continue;
    const save = Math.round((high.average - low.average) * high.count);
    moneyInsights.push({
      tone: "money",
      score: save,
      title: `${high.name} is the expensive ${trade.toLowerCase()} call`,
      detail: `${high.name} averages ${money(high.average)} across ${high.count} ${trade.toLowerCase()} charges. ${low.name} averages ${money(low.average)}. Using the lower average on those ${high.count} charges is about ${money(save)}.`,
    });
  }

  const expenseTotal = expenses.reduce((sum, row) => sum + row.amountCents, 0);
  const byVendor = new Map<string, number>();
  expenses.forEach((row) => {
    if (!row.vendor) return;
    byVendor.set(row.vendor, (byVendor.get(row.vendor) || 0) + row.amountCents);
  });
  const top = [...byVendor].sort((a, b) => b[1] - a[1])[0];
  if (top && expenseTotal && top[1] / expenseTotal >= 0.3) {
    moneyInsights.push({
      tone: "money",
      score: top[1],
      title: `${top[0]} is ${Math.round((top[1] / expenseTotal) * 100)}% of the spend in this file`,
      detail: `${money(top[1])} went to one vendor. That is enough history to ask for a portfolio rate, and to keep a second name for the same trade.`,
    });
  }

  const dupes = new Map<string, PlannedRow[]>();
  expenses.forEach((row) => {
    const key = [row.date, normalize(row.vendor), row.amountCents, normalize(row.address)].join("|");
    dupes.set(key, [...(dupes.get(key) || []), row]);
  });
  const duplicateRows = [...dupes.values()].filter((group) => group.length > 1);
  const duplicateCents = duplicateRows.reduce((sum, group) => sum + group[0].amountCents * (group.length - 1), 0);
  if (duplicateCents) {
    moneyInsights.push({
      tone: "money",
      score: duplicateCents,
      title: `${money(duplicateCents)} looks paid twice`,
      detail: `${duplicateRows.length} charge${duplicateRows.length === 1 ? "" : "s"} match the same vendor, date, door, and amount. Confirm the second line before it becomes a book entry.`,
    });
  }

  const repeat = new Map<string, PlannedRow[]>();
  expenses.forEach((row) => {
    if (!row.address) return;
    const key = `${normalize(row.address)}|${row.kind || "repairs"}`;
    repeat.set(key, [...(repeat.get(key) || []), row]);
  });
  const chronic = [...repeat.values()].filter((group) => group.length >= 3).sort((a, b) => b.length - a.length)[0];
  if (chronic) {
    const label = BOOK_KINDS[chronic[0].kind || "repairs"].label.toLowerCase();
    operations.push({
      tone: "operations",
      score: chronic.length,
      title: `${chronic[0].address} has the same ${label} problem ${chronic.length} times`,
      detail: `That pattern is a repair cycle. The next work order can start from the history instead of a new diagnosis.`,
    });
  }

  const doors = new Map<string, PlannedRow[]>();
  rows.forEach((row) => {
    const key = normalize(row.address);
    if (key.length < 5) return;
    doors.set(row.address, [...(doors.get(row.address) || []), row]);
  });
  const quiet = [...doors.entries()].find(([, doorRows]) => {
    const spent = doorRows.some((row) => row.flow === "expense");
    const earned = doorRows.some((row) => row.flow === "income");
    return spent && !earned;
  });
  if (quiet) {
    operations.push({
      tone: "operations",
      score: 2,
      title: `${quiet[0]} has bills and no rent in this file`,
      detail: `Either the home is vacant, or the rent was collected somewhere this spreadsheet does not show. Worth knowing before the first owner statement.`,
    });
  }

  const rhythm = new Map<string, PlannedRow[]>();
  expenses.forEach((row) => {
    if (!row.vendor) return;
    rhythm.set(`${normalize(row.vendor)}|${row.amountCents}`, [...(rhythm.get(`${normalize(row.vendor)}|${row.amountCents}`) || []), row]);
  });
  const contract = [...rhythm.values()].filter((group) => group.length >= 3).sort((a, b) => b.length - a.length)[0];
  if (contract) {
    efficiency.push({
      tone: "efficiency",
      score: contract.length,
      title: `${contract[0].vendor} already bills like a contract`,
      detail: `${contract.length} charges at ${money(contract[0].amountCents)}. Put that price on the vendor record so the next month is not a fresh search.`,
    });
  }

  const missingContact = rows.filter((row) => row.tenant && !row.tenantEmail && !row.tenantPhone);
  const missingNames = [...new Set(missingContact.map((row) => row.tenant))];
  if (missingNames.length) {
    efficiency.push({
      tone: "efficiency",
      score: missingNames.length,
      title: missingNames.length === 1 ? `${missingNames[0]} has no email or phone` : `${missingNames.length} tenants have no email or phone`,
      detail: `The portal link needs one of those. Collect it once and rent requests stop arriving as texts to the office.`,
    });
  }

  const picked: MigrationInsight[] = [];
  const take = (list: Array<MigrationInsight & { score: number }>) => {
    const next = list.sort((a, b) => b.score - a.score).find((item) => !picked.some((chosen) => chosen.title === item.title));
    if (next) picked.push({ tone: next.tone, title: next.title, detail: next.detail });
  };
  take(moneyInsights);
  take(efficiency);
  take(operations);
  [...moneyInsights, ...efficiency, ...operations]
    .sort((a, b) => b.score - a.score)
    .forEach((item) => {
      if (picked.length >= 4) return;
      if (!picked.some((chosen) => chosen.title === item.title)) picked.push({ tone: item.tone, title: item.title, detail: item.detail });
    });
  if (!picked.length && rows.length) {
    picked.push({
      tone: "operations",
      title: "Nothing in this file is asking for a second look",
      detail: "No duplicate charges, no single-vendor pileup, and every door with a bill also has income. Save it and the desk opens on your homes.",
    });
  }
  return picked.slice(0, 4);
}
