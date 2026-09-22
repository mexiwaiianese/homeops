import {
  BOOK_KINDS,
  buildOwnerStatements,
  inPeriod,
  type BookEntry,
  type BookKind,
  type BooksHome,
  type BooksOwner,
} from "@/lib/books";

export const NEC_THRESHOLD_CENTS = 60_000;

const NEC_KINDS = new Set<BookKind>(["repairs", "hvac", "plumbing", "landscaping", "turnover", "capital", "management"]);

export const SCHEDULE_E_LINES: { id: string; line: string; label: string; kinds: BookKind[] }[] = [
  { id: "rents", line: "3", label: "Rents received", kinds: ["rent_income", "late_fee", "other_income"] },
  { id: "cleaning", line: "7", label: "Cleaning and maintenance", kinds: ["turnover"] },
  { id: "insurance", line: "9", label: "Insurance", kinds: ["insurance"] },
  { id: "management", line: "11", label: "Management fees", kinds: ["management"] },
  { id: "repairs", line: "14", label: "Repairs", kinds: ["repairs", "hvac", "plumbing"] },
  { id: "taxes", line: "16", label: "Taxes", kinds: ["taxes"] },
  { id: "utilities", line: "17", label: "Utilities", kinds: ["utilities"] },
  { id: "other", line: "19", label: "Other", kinds: ["hoa", "landscaping"] },
];

export const SCHEDULE_E_UNTRACKED = [
  { line: "5", label: "Advertising" },
  { line: "6", label: "Auto and travel" },
  { line: "8", label: "Commissions" },
  { line: "10", label: "Legal and other professional fees" },
  { line: "12", label: "Mortgage interest paid to banks" },
  { line: "13", label: "Other interest" },
  { line: "15", label: "Supplies" },
  { line: "18", label: "Depreciation expense or depletion" },
];

export function parseReportYear(value?: string | null, fallback = new Date().getFullYear()) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return fallback;
  return year;
}

export function calendarYearRange(year: number) {
  return { year, start: `${year}-01-01`, end: `${year}-12-31` };
}

export function csvEscape(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
  return text;
}

export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  return `\uFEFF${[headers.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\r\n")}`;
}

function dollars(cents: number) {
  return (cents / 100).toFixed(2);
}

function ownerName(owners: BooksOwner[], id?: string | null) {
  return owners.find((owner) => owner.id === id)?.name || "";
}

function doorLabel(homes: BooksHome[], id?: string | null) {
  if (!id) return "Company overhead";
  return homes.find((home) => home.id === id)?.address1 || "Unassigned door";
}

export type ScheduleEWorksheet = {
  homeId: string;
  address: string;
  ownerName: string;
  rents: number;
  lines: { id: string; line: string; label: string; amountCents: number }[];
  totalExpenses: number;
  rentalIncome: number;
  capitalCents: number;
};

export type Vendor1099Row = {
  vendorName: string;
  amountCents: number;
  transactions: number;
  doors: string[];
  kinds: string[];
  meetsThreshold: boolean;
};

export type DoorYearResult = {
  home: BooksHome;
  ownerName: string;
  income: number;
  operating: number;
  capital: number;
  noi: number;
  cash: number;
};

export type AccountantRow = {
  date: string;
  door: string;
  owner: string;
  vendor: string;
  kind: string;
  flow: string;
  amountCents: number;
  source: string;
  description: string;
};

export type YearReport = {
  year: number;
  start: string;
  end: string;
  income: number;
  operating: number;
  capital: number;
  noi: number;
  disbursed: number;
  contributions: number;
  owners: ReturnType<typeof buildOwnerStatements>;
  doors: DoorYearResult[];
  scheduleE: ScheduleEWorksheet[];
  nec1099: Vendor1099Row[];
  necTotal: number;
  necOverThreshold: number;
  accountantRows: AccountantRow[];
  notes: string[];
};

export function buildYearReport(input: {
  year: number;
  homes: BooksHome[];
  owners: BooksOwner[];
  entries: BookEntry[];
}): YearReport {
  const { year, start, end } = calendarYearRange(input.year);
  const rows = input.entries
    .filter((row) => inPeriod(row.txDate, start, end))
    .sort((a, b) => a.txDate.localeCompare(b.txDate) || a.description.localeCompare(b.description));
  const owners = buildOwnerStatements({
    owners: input.owners,
    homes: input.homes,
    entries: input.entries,
    periodStart: start,
    periodEnd: end,
  });
  const doors: DoorYearResult[] = input.homes
    .map((home) => {
      const homeRows = rows.filter((row) => row.homeId === home.id);
      const income = homeRows.filter((row) => row.flowType === "income").reduce((sum, row) => sum + row.amountCents, 0);
      const operating = homeRows
        .filter((row) => row.flowType === "expense" && BOOK_KINDS[row.kind].expenseClass === "Operating")
        .reduce((sum, row) => sum + row.amountCents, 0);
      const capital = homeRows.filter((row) => row.kind === "capital").reduce((sum, row) => sum + row.amountCents, 0);
      return {
        home,
        ownerName: ownerName(input.owners, home.ownerId),
        income,
        operating,
        capital,
        noi: income - operating,
        cash: income - operating - capital,
      };
    })
    .sort((a, b) => a.home.address1.localeCompare(b.home.address1));

  const scheduleE: ScheduleEWorksheet[] = input.homes.map((home) => {
    const homeRows = rows.filter((row) => row.homeId === home.id && row.flowType !== "transfer");
    const lines = SCHEDULE_E_LINES.map((line) => ({
      id: line.id,
      line: line.line,
      label: line.label,
      amountCents: homeRows.filter((row) => line.kinds.includes(row.kind)).reduce((sum, row) => sum + row.amountCents, 0),
    }));
    const rents = lines.find((line) => line.id === "rents")?.amountCents || 0;
    const totalExpenses = lines.filter((line) => line.id !== "rents").reduce((sum, line) => sum + line.amountCents, 0);
    return {
      homeId: home.id,
      address: home.address1,
      ownerName: ownerName(input.owners, home.ownerId),
      rents,
      lines,
      totalExpenses,
      rentalIncome: rents - totalExpenses,
      capitalCents: homeRows.filter((row) => row.kind === "capital").reduce((sum, row) => sum + row.amountCents, 0),
    };
  });

  const necMap = new Map<string, Vendor1099Row>();
  for (const row of rows) {
    if (row.flowType !== "expense" || !NEC_KINDS.has(row.kind)) continue;
    const vendorName = row.vendorName?.trim() || "Unknown vendor";
    const key = vendorName.toLowerCase();
    const current = necMap.get(key) || {
      vendorName,
      amountCents: 0,
      transactions: 0,
      doors: [],
      kinds: [],
      meetsThreshold: false,
    };
    current.amountCents += row.amountCents;
    current.transactions += 1;
    const door = doorLabel(input.homes, row.homeId);
    if (!current.doors.includes(door)) current.doors.push(door);
    const kindLabel = BOOK_KINDS[row.kind].label;
    if (!current.kinds.includes(kindLabel)) current.kinds.push(kindLabel);
    necMap.set(key, current);
  }
  const nec1099 = [...necMap.values()]
    .map((row) => ({ ...row, meetsThreshold: row.amountCents >= NEC_THRESHOLD_CENTS }))
    .sort((a, b) => b.amountCents - a.amountCents);

  const accountantRows: AccountantRow[] = rows.map((row) => ({
    date: row.txDate,
    door: doorLabel(input.homes, row.homeId),
    owner: ownerName(input.owners, row.ownerId) || ownerName(input.owners, input.homes.find((home) => home.id === row.homeId)?.ownerId),
    vendor: row.vendorName || "",
    kind: BOOK_KINDS[row.kind].label,
    flow: row.flowType,
    amountCents: row.amountCents,
    source: row.source,
    description: row.description,
  }));

  const income = owners.reduce((sum, row) => sum + row.income, 0);
  const operating = owners.reduce((sum, row) => sum + row.operating, 0);
  const capital = owners.reduce((sum, row) => sum + row.capital, 0);

  return {
    year,
    start,
    end,
    income,
    operating,
    capital,
    noi: income - operating,
    disbursed: owners.reduce((sum, row) => sum + row.disbursed, 0),
    contributions: owners.reduce((sum, row) => sum + row.contributions, 0),
    owners,
    doors,
    scheduleE,
    nec1099,
    necTotal: nec1099.reduce((sum, row) => sum + row.amountCents, 0),
    necOverThreshold: nec1099.filter((row) => row.meetsThreshold).length,
    accountantRows,
    notes: [
      "Cash basis: rent is income when collected; expenses post when a bill is marked paid.",
      "Deposits and owner contributions or draws are transfers, not Schedule E income or expense.",
      "Capital improvements are listed and not deducted. HomeOps does not calculate depreciation.",
      "Mortgage interest, advertising, legal, auto, and supplies are not on this ledger yet.",
      "The 1099-NEC list is a worksheet from paid repair, trade, and management vendors. It is not an e-file and does not include TINs.",
    ],
  };
}

export function accountantCsv(report: YearReport) {
  return toCsv(
    ["Date", "Door", "Owner", "Vendor", "Kind", "Flow", "Amount", "Source", "Description"],
    report.accountantRows.map((row) => [row.date, row.door, row.owner, row.vendor, row.kind, row.flow, dollars(row.amountCents), row.source, row.description]),
  );
}

export function scheduleECsv(report: YearReport) {
  const rows: Array<Array<string | number>> = [];
  for (const sheet of report.scheduleE) {
    for (const line of sheet.lines) {
      rows.push([sheet.address, sheet.ownerName, line.line, line.label, dollars(line.amountCents)]);
    }
    rows.push([sheet.address, sheet.ownerName, "20", "Total expenses", dollars(sheet.totalExpenses)]);
    rows.push([sheet.address, sheet.ownerName, "21", "Rents minus expenses", dollars(sheet.rentalIncome)]);
    rows.push([sheet.address, sheet.ownerName, "", "Capital improvements (not deducted)", dollars(sheet.capitalCents)]);
  }
  return toCsv(["Door", "Owner", "Schedule E line", "Category", "Amount"], rows);
}

export function nec1099Csv(report: YearReport) {
  return toCsv(
    ["Vendor", "Amount", "Payments", "Meets $600", "Categories", "Doors"],
    report.nec1099.map((row) => [
      row.vendorName,
      dollars(row.amountCents),
      row.transactions,
      row.meetsThreshold ? "Yes" : "No",
      row.kinds.join("; "),
      row.doors.join("; "),
    ]),
  );
}
