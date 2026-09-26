import { BOOK_KINDS, type BookEntry, type BookKind } from "@/lib/books";
import { evaluateExpression, expressionIdentifiers, type MetricVariables } from "@/lib/metric-expression";

// ---------- Domain types shared by demo, live, API, and UI ----------

export type PropertyType = "single_family" | "townhome" | "condo" | "duplex" | "multifamily" | "other";

export const PROPERTY_TYPES: Record<PropertyType, string> = {
  single_family: "Single family",
  townhome: "Townhome",
  condo: "Condo",
  duplex: "Duplex",
  multifamily: "Multifamily",
  other: "Other",
};

export function isPropertyType(value: unknown): value is PropertyType {
  return typeof value === "string" && value in PROPERTY_TYPES;
}

export type OwnerHome = {
  id: string;
  address1: string;
  city: string;
  state: string;
  type: PropertyType;
  rentCents: number;
  reserveCents: number;
  health: "good" | "watch" | "urgent";
  occupied: boolean;
  tenantName?: string | null;
  leaseEnds?: string | null;
  rentOutstandingCents: number;
  depositsHeldCents: number;
};

export type OwnerMaintenance = {
  id: string;
  homeId: string;
  title: string;
  status: string;
  priority: string;
  estimateCents: number;
  needsOwnerApproval: boolean;
};

export type OwnerProfile = {
  id: string;
  name: string;
  email?: string | null;
  reserveFloorCents: number;
  disbursementDay: number;
  managerName?: string | null;
};

export type MetricFormat = "currency" | "percent" | "number" | "ratio" | "months";

export type MetricDefinition = {
  title: string;
  format: MetricFormat;
  expression: string;
  explanation: string;
  // When set, the metric ignores dashboard filters for that dimension.
  scope?: { homeIds?: string[]; types?: PropertyType[] } | null;
  period?: PeriodPreset | { start: string; end: string } | null;
};

export type CustomMetric = MetricDefinition & { id: string; prompt: string; createdAt: string };

export type DashboardLayout = { order: string[]; hidden: string[]; sizes?: Record<string, WidgetSize> };

export type OwnerPortalPayload = {
  mode: "demo" | "live";
  owner: OwnerProfile;
  homes: OwnerHome[];
  entries: BookEntry[];
  maintenance: OwnerMaintenance[];
  layout: DashboardLayout | null;
  customMetrics: CustomMetric[];
  aiConfigured: boolean;
  preview?: boolean;
};

// ---------- Periods ----------

export type PeriodPreset = "this_month" | "last_month" | "qtd" | "last_quarter" | "ytd" | "last_year" | "t12" | "all";

export const PERIOD_PRESETS: Record<PeriodPreset, string> = {
  this_month: "This month",
  last_month: "Last month",
  qtd: "Quarter to date",
  last_quarter: "Last quarter",
  ytd: "Year to date",
  last_year: "Last year",
  t12: "Trailing 12 months",
  all: "All time",
};

export type DateRange = { start: string; end: string; label: string };

const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const monthStart = (year: number, monthIndex: number) => new Date(year, monthIndex, 1);
const monthEnd = (year: number, monthIndex: number) => new Date(year, monthIndex + 1, 0);

export function monthKey(date: string) {
  return date.slice(0, 7);
}

export function monthLabel(month: string, style: "short" | "long" = "short") {
  return new Date(`${month}-02T12:00:00`).toLocaleDateString("en-US", { month: style, year: style === "short" ? "2-digit" : "numeric" });
}

export function monthRange(month: string): DateRange {
  const [year, m] = month.split("-").map(Number);
  return { start: iso(monthStart(year, m - 1)), end: iso(monthEnd(year, m - 1)), label: monthLabel(month, "long") };
}

export function quarterRange(year: number, quarter: number): DateRange {
  const first = (quarter - 1) * 3;
  return { start: iso(monthStart(year, first)), end: iso(monthEnd(year, first + 2)), label: `Q${quarter} ${year}` };
}

export function yearRange(year: number): DateRange {
  return { start: `${year}-01-01`, end: `${year}-12-31`, label: `${year}` };
}

export function resolvePeriod(preset: PeriodPreset, now = new Date()): DateRange {
  const year = now.getFullYear();
  const month = now.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  switch (preset) {
    case "this_month":
      return { start: iso(monthStart(year, month)), end: iso(monthEnd(year, month)), label: PERIOD_PRESETS[preset] };
    case "last_month": {
      const date = monthStart(year, month - 1);
      return { start: iso(date), end: iso(monthEnd(date.getFullYear(), date.getMonth())), label: PERIOD_PRESETS[preset] };
    }
    case "qtd":
      return { ...quarterRange(year, quarter), end: iso(monthEnd(year, month)), label: PERIOD_PRESETS[preset] };
    case "last_quarter": {
      const lastQuarter = quarter === 1 ? 4 : quarter - 1;
      const lastYear = quarter === 1 ? year - 1 : year;
      return { ...quarterRange(lastYear, lastQuarter), label: PERIOD_PRESETS[preset] };
    }
    case "ytd":
      return { start: `${year}-01-01`, end: iso(monthEnd(year, month)), label: PERIOD_PRESETS[preset] };
    case "last_year":
      return { ...yearRange(year - 1), label: PERIOD_PRESETS[preset] };
    case "t12": {
      const date = monthStart(year, month - 11);
      return { start: iso(date), end: iso(monthEnd(year, month)), label: PERIOD_PRESETS[preset] };
    }
    case "all":
    default:
      return { start: "2000-01-01", end: iso(monthEnd(year, month)), label: PERIOD_PRESETS.all };
  }
}

export function customRange(startMonth: string, endMonth: string): DateRange {
  const start = monthRange(startMonth);
  const end = monthRange(endMonth);
  return { start: start.start, end: end.end, label: startMonth === endMonth ? start.label : `${monthLabel(startMonth)} – ${monthLabel(endMonth)}` };
}

// The same-length window immediately before a range, used for deltas.
export function priorRange(range: DateRange): DateRange {
  const start = new Date(`${range.start}T12:00:00`);
  const end = new Date(`${range.end}T12:00:00`);
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  const priorStart = monthStart(start.getFullYear(), start.getMonth() - months);
  const priorEnd = monthEnd(start.getFullYear(), start.getMonth() - 1);
  return { start: iso(priorStart), end: iso(priorEnd), label: "Prior period" };
}

export function monthsInRange(range: DateRange) {
  const start = new Date(`${range.start}T12:00:00`);
  const end = new Date(`${range.end}T12:00:00`);
  const keys: string[] = [];
  const cursor = monthStart(start.getFullYear(), start.getMonth());
  while (cursor <= end) {
    keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

// ---------- Filters ----------

export type DashboardFilters = {
  homeIds: string[]; // empty = all
  types: PropertyType[]; // empty = all
  preset: PeriodPreset | "custom";
  customStart: string; // YYYY-MM
  customEnd: string; // YYYY-MM
};

export function filterHomes(homes: OwnerHome[], filters: Pick<DashboardFilters, "homeIds" | "types">) {
  return homes.filter((home) => (!filters.homeIds.length || filters.homeIds.includes(home.id)) && (!filters.types.length || filters.types.includes(home.type)));
}

export function filtersToRange(filters: DashboardFilters, now = new Date()): DateRange {
  if (filters.preset === "custom" && filters.customStart && filters.customEnd) {
    const [start, end] = filters.customStart <= filters.customEnd ? [filters.customStart, filters.customEnd] : [filters.customEnd, filters.customStart];
    return customRange(start, end);
  }
  return resolvePeriod(filters.preset === "custom" ? "ytd" : filters.preset, now);
}

// Owner-level rows (draws, contributions with no home) only belong in a whole-portfolio view;
// attributing them to one selected property would misstate that property's cash result.
export function scopeEntries(entries: BookEntry[], homes: OwnerHome[], range: DateRange, options: { includeUnassigned?: boolean } = {}) {
  const ids = new Set(homes.map((home) => home.id));
  const includeUnassigned = options.includeUnassigned ?? true;
  return entries.filter((row) => row.txDate >= range.start && row.txDate <= range.end && (row.homeId ? ids.has(row.homeId) : includeUnassigned));
}

// ---------- Statements ----------

export type StatementLine = { kind: BookKind; label: string; amountCents: number };

export type ProfitAndLoss = {
  incomeLines: StatementLine[];
  operatingLines: StatementLine[];
  income: number;
  operating: number;
  noi: number;
  capital: number;
  cashFlow: number; // NOI minus capital
  margin: number;
  opexRatio: number;
};

export type CashFlowStatement = {
  noi: number;
  capital: number;
  contributions: number;
  disbursements: number;
  depositsIn: number;
  depositsOut: number;
  netToOwner: number; // NOI - capital + contributions - disbursements
};

const sumKinds = (rows: BookEntry[], kinds: BookKind[]) => rows.filter((row) => kinds.includes(row.kind)).reduce((sum, row) => sum + row.amountCents, 0);

export function buildProfitAndLoss(rows: BookEntry[]): ProfitAndLoss {
  const lines = (flow: "income" | "expense", expenseClass?: "Operating") =>
    (Object.keys(BOOK_KINDS) as BookKind[])
      .filter((kind) => BOOK_KINDS[kind].flow === flow && (!expenseClass || BOOK_KINDS[kind].expenseClass === expenseClass))
      .map((kind) => ({ kind, label: BOOK_KINDS[kind].label, amountCents: sumKinds(rows, [kind]) }))
      .filter((line) => line.amountCents !== 0);
  const incomeLines = lines("income");
  const operatingLines = lines("expense", "Operating").sort((a, b) => b.amountCents - a.amountCents);
  const income = incomeLines.reduce((sum, line) => sum + line.amountCents, 0);
  const operating = operatingLines.reduce((sum, line) => sum + line.amountCents, 0);
  const capital = sumKinds(rows, ["capital"]);
  const noi = income - operating;
  return {
    incomeLines,
    operatingLines,
    income,
    operating,
    noi,
    capital,
    cashFlow: noi - capital,
    margin: income ? noi / income : 0,
    opexRatio: income ? operating / income : 0,
  };
}

export function buildCashFlow(rows: BookEntry[]): CashFlowStatement {
  const pnl = buildProfitAndLoss(rows);
  const contributions = sumKinds(rows, ["owner_contribution"]);
  const disbursements = sumKinds(rows, ["owner_disbursement"]);
  const depositsIn = sumKinds(rows, ["deposit_hold"]);
  const depositsOut = sumKinds(rows, ["deposit_return"]);
  return {
    noi: pnl.noi,
    capital: pnl.capital,
    contributions,
    disbursements,
    depositsIn,
    depositsOut,
    netToOwner: pnl.noi - pnl.capital + contributions - disbursements,
  };
}

export type MonthPoint = { month: string; income: number; operating: number; capital: number; noi: number; cashFlow: number };

export function buildMonthlySeries(rows: BookEntry[], range: DateRange): MonthPoint[] {
  return monthsInRange(range).map((month) => {
    const pnl = buildProfitAndLoss(rows.filter((row) => monthKey(row.txDate) === month));
    return { month, income: pnl.income, operating: pnl.operating, capital: pnl.capital, noi: pnl.noi, cashFlow: pnl.cashFlow };
  });
}

export type PropertyResult = {
  home: OwnerHome;
  income: number;
  operating: number;
  capital: number;
  noi: number;
  margin: number;
  collectionRate: number;
};

export function buildPropertyResults(rows: BookEntry[], homes: OwnerHome[], months: number): PropertyResult[] {
  return homes
    .map((home) => {
      const pnl = buildProfitAndLoss(rows.filter((row) => row.homeId === home.id));
      const scheduled = home.rentCents * Math.max(1, months);
      const rent = sumKinds(rows.filter((row) => row.homeId === home.id), ["rent_income"]);
      return { home, income: pnl.income, operating: pnl.operating, capital: pnl.capital, noi: pnl.noi, margin: pnl.margin, collectionRate: scheduled ? Math.min(1.25, rent / scheduled) : 0 };
    })
    .sort((a, b) => b.noi - a.noi);
}

// ---------- Historical closings ----------

export type ClosingKind = "month" | "quarter" | "year";
export type ClosingPeriod = { id: string; kind: ClosingKind; range: DateRange; pnl: ProfitAndLoss; cash: CashFlowStatement; closed: boolean };

export function buildClosings(entries: BookEntry[], homes: OwnerHome[], kind: ClosingKind, now = new Date(), options: { includeUnassigned?: boolean } = {}): ClosingPeriod[] {
  const ids = new Set(homes.map((home) => home.id));
  const includeUnassigned = options.includeUnassigned ?? true;
  const scoped = entries.filter((row) => (row.homeId ? ids.has(row.homeId) : includeUnassigned));
  if (!scoped.length) return [];
  const first = scoped.reduce((min, row) => (row.txDate < min ? row.txDate : min), scoped[0].txDate);
  const firstDate = new Date(`${first}T12:00:00`);
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const ranges: DateRange[] = [];
  if (kind === "month") {
    const cursor = monthStart(firstDate.getFullYear(), firstDate.getMonth());
    while (cursor <= now) {
      ranges.push(monthRange(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else if (kind === "quarter") {
    let year = firstDate.getFullYear();
    let quarter = Math.floor(firstDate.getMonth() / 3) + 1;
    const endYear = now.getFullYear();
    const endQuarter = Math.floor(now.getMonth() / 3) + 1;
    while (year < endYear || (year === endYear && quarter <= endQuarter)) {
      ranges.push(quarterRange(year, quarter));
      quarter++;
      if (quarter > 4) { quarter = 1; year++; }
    }
  } else {
    for (let year = firstDate.getFullYear(); year <= now.getFullYear(); year++) ranges.push(yearRange(year));
  }
  return ranges
    .map((range) => {
      const rows = scoped.filter((row) => row.txDate >= range.start && row.txDate <= range.end);
      return {
        id: `${kind}:${range.start}`,
        kind,
        range,
        pnl: buildProfitAndLoss(rows),
        cash: buildCashFlow(rows),
        closed: range.end < `${currentMonth}-01`,
      };
    })
    .filter((period) => period.pnl.income || period.pnl.operating || period.pnl.capital || period.cash.contributions || period.cash.disbursements)
    .reverse();
}

// ---------- Snapshot + KPI variables ----------

export type PortfolioSnapshot = {
  range: DateRange;
  months: number;
  partial: boolean; // true when only some of the owner's properties are in scope
  homes: OwnerHome[];
  rows: BookEntry[];
  pnl: ProfitAndLoss;
  cash: CashFlowStatement;
  prior: ProfitAndLoss;
  series: MonthPoint[];
  properties: PropertyResult[];
  occupancy: number;
  scheduledRent: number;
  collectionRate: number;
  maintenancePerDoor: number;
  reserveBalance: number;
  reserveFloor: number;
  depositsHeld: number;
  rentOutstanding: number;
  openMaintenance: OwnerMaintenance[];
  variables: MetricVariables;
};

const MAINTENANCE_KINDS: BookKind[] = ["repairs", "hvac", "plumbing", "landscaping", "turnover"];

export function buildSnapshot(input: {
  owner: OwnerProfile;
  homes: OwnerHome[];
  entries: BookEntry[];
  maintenance: OwnerMaintenance[];
  range: DateRange;
  totalHomes?: number; // owner's full property count; defaults to homes.length (whole portfolio)
}): PortfolioSnapshot {
  const { homes, range } = input;
  const partial = homes.length < (input.totalHomes ?? homes.length);
  const rows = scopeEntries(input.entries, homes, range, { includeUnassigned: !partial });
  const priorRows = scopeEntries(input.entries, homes, priorRange(range), { includeUnassigned: !partial });
  const months = monthsInRange(range).length;
  const pnl = buildProfitAndLoss(rows);
  const cash = buildCashFlow(rows);
  const prior = buildProfitAndLoss(priorRows);
  const occupied = homes.filter((home) => home.occupied).length;
  const scheduledRent = homes.filter((home) => home.occupied).reduce((sum, home) => sum + home.rentCents, 0) * months;
  const rentCollected = sumKinds(rows, ["rent_income"]);
  const maintenanceSpend = sumKinds(rows, MAINTENANCE_KINDS);
  const reserveBalance = homes.reduce((sum, home) => sum + home.reserveCents, 0);
  const depositsHeld = homes.reduce((sum, home) => sum + home.depositsHeldCents, 0);
  const rentOutstanding = homes.reduce((sum, home) => sum + home.rentOutstandingCents, 0);
  const homeIds = new Set(homes.map((home) => home.id));
  const openMaintenance = input.maintenance.filter((row) => homeIds.has(row.homeId) && row.status !== "Documented" && row.status !== "documented");
  const doors = homes.length;
  const perDoor = (value: number) => (doors ? value / doors : 0);

  const kindTotals: MetricVariables = {};
  for (const kind of Object.keys(BOOK_KINDS) as BookKind[]) kindTotals[kind] = sumKinds(rows, [kind]) / 100;

  const variables: MetricVariables = {
    ...kindTotals,
    income: pnl.income / 100,
    rent_collected: rentCollected / 100,
    late_fees: kindTotals.late_fee,
    operating_expenses: pnl.operating / 100,
    capital_expenses: pnl.capital / 100,
    total_expenses: (pnl.operating + pnl.capital) / 100,
    noi: pnl.noi / 100,
    cash_flow: pnl.cashFlow / 100,
    net_to_owner: cash.netToOwner / 100,
    disbursements: cash.disbursements / 100,
    contributions: cash.contributions / 100,
    management_fees: kindTotals.management,
    maintenance: maintenanceSpend / 100,
    repairs_total: kindTotals.repairs + kindTotals.hvac + kindTotals.plumbing,
    scheduled_rent: scheduledRent / 100,
    collection_rate: scheduledRent ? rentCollected / scheduledRent : 0,
    occupancy: doors ? occupied / doors : 0,
    doors,
    occupied_doors: occupied,
    vacant_doors: doors - occupied,
    months,
    avg_rent: occupied ? homes.filter((home) => home.occupied).reduce((sum, home) => sum + home.rentCents, 0) / occupied / 100 : 0,
    reserve_balance: reserveBalance / 100,
    reserve_floor: input.owner.reserveFloorCents / 100,
    deposits_held: depositsHeld / 100,
    rent_outstanding: rentOutstanding / 100,
    open_maintenance: openMaintenance.length,
    maintenance_estimates: openMaintenance.reduce((sum, row) => sum + row.estimateCents, 0) / 100,
    prior_income: prior.income / 100,
    prior_noi: prior.noi / 100,
    prior_operating_expenses: prior.operating / 100,
    noi_margin: pnl.margin,
    opex_ratio: pnl.opexRatio,
    income_per_door: perDoor(pnl.income) / 100,
    noi_per_door: perDoor(pnl.noi) / 100,
    maintenance_per_door: perDoor(maintenanceSpend) / 100,
  };

  return {
    range,
    months,
    partial,
    homes,
    rows,
    pnl,
    cash,
    prior,
    series: buildMonthlySeries(rows, range),
    properties: buildPropertyResults(rows, homes, months),
    occupancy: variables.occupancy,
    scheduledRent,
    collectionRate: variables.collection_rate,
    maintenancePerDoor: perDoor(maintenanceSpend),
    reserveBalance,
    reserveFloor: input.owner.reserveFloorCents,
    depositsHeld,
    rentOutstanding,
    openMaintenance,
    variables,
  };
}

// Variables the AI (and owners writing formulas) may reference. Dollar values are in dollars, not cents.
export const METRIC_VARIABLES: Array<{ name: string; description: string; unit: "dollars" | "ratio" | "count" }> = [
  { name: "income", description: "All income collected (rent, late fees, other tenant charges)", unit: "dollars" },
  { name: "rent_collected", description: "Rent collected", unit: "dollars" },
  { name: "late_fees", description: "Late fees collected", unit: "dollars" },
  { name: "operating_expenses", description: "All operating expenses (repairs, HVAC, plumbing, landscaping, turnover, insurance, taxes, HOA, utilities, management)", unit: "dollars" },
  { name: "capital_expenses", description: "Capital improvements", unit: "dollars" },
  { name: "total_expenses", description: "Operating plus capital expenses", unit: "dollars" },
  { name: "noi", description: "Net operating income = income - operating_expenses", unit: "dollars" },
  { name: "cash_flow", description: "NOI minus capital expenses", unit: "dollars" },
  { name: "net_to_owner", description: "NOI - capital + owner contributions - owner disbursements", unit: "dollars" },
  { name: "disbursements", description: "Cash already sent to the owner", unit: "dollars" },
  { name: "contributions", description: "Cash the owner put in", unit: "dollars" },
  { name: "management_fees", description: "Management fees", unit: "dollars" },
  { name: "maintenance", description: "Repairs + HVAC + plumbing + landscaping + turnover", unit: "dollars" },
  { name: "repairs", description: "Repairs & maintenance line only", unit: "dollars" },
  { name: "hvac", description: "HVAC spend", unit: "dollars" },
  { name: "plumbing", description: "Plumbing spend", unit: "dollars" },
  { name: "landscaping", description: "Landscaping spend", unit: "dollars" },
  { name: "turnover", description: "Turnover / make-ready spend", unit: "dollars" },
  { name: "insurance", description: "Insurance", unit: "dollars" },
  { name: "taxes", description: "Property taxes", unit: "dollars" },
  { name: "hoa", description: "HOA dues", unit: "dollars" },
  { name: "utilities", description: "Utilities", unit: "dollars" },
  { name: "scheduled_rent", description: "Rent that should have been collected (occupied doors x monthly rent x months)", unit: "dollars" },
  { name: "collection_rate", description: "rent_collected / scheduled_rent", unit: "ratio" },
  { name: "occupancy", description: "occupied_doors / doors", unit: "ratio" },
  { name: "noi_margin", description: "noi / income", unit: "ratio" },
  { name: "opex_ratio", description: "operating_expenses / income", unit: "ratio" },
  { name: "doors", description: "Number of properties in scope", unit: "count" },
  { name: "occupied_doors", description: "Occupied properties", unit: "count" },
  { name: "vacant_doors", description: "Vacant properties", unit: "count" },
  { name: "months", description: "Months in the selected period", unit: "count" },
  { name: "avg_rent", description: "Average monthly rent per occupied door", unit: "dollars" },
  { name: "reserve_balance", description: "Reserve cash held across properties", unit: "dollars" },
  { name: "reserve_floor", description: "Owner's minimum reserve rule", unit: "dollars" },
  { name: "deposits_held", description: "Security deposits held", unit: "dollars" },
  { name: "rent_outstanding", description: "Rent currently owed by tenants", unit: "dollars" },
  { name: "open_maintenance", description: "Open maintenance requests", unit: "count" },
  { name: "maintenance_estimates", description: "Sum of estimates on open maintenance", unit: "dollars" },
  { name: "prior_income", description: "Income in the same-length prior period", unit: "dollars" },
  { name: "prior_noi", description: "NOI in the prior period", unit: "dollars" },
  { name: "prior_operating_expenses", description: "Operating expenses in the prior period", unit: "dollars" },
  { name: "income_per_door", description: "income / doors", unit: "dollars" },
  { name: "noi_per_door", description: "noi / doors", unit: "dollars" },
  { name: "maintenance_per_door", description: "maintenance / doors", unit: "dollars" },
];

export function validateMetricDefinition(input: unknown): { ok: true; definition: MetricDefinition } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "Metric must be an object" };
  const raw = input as Record<string, unknown>;
  const title = String(raw.title || "").trim().slice(0, 80);
  const expression = String(raw.expression || "").trim().slice(0, 400);
  const format = String(raw.format || "number") as MetricFormat;
  if (!title) return { ok: false, error: "Metric needs a title" };
  if (!expression) return { ok: false, error: "Metric needs an expression" };
  if (!["currency", "percent", "number", "ratio", "months"].includes(format)) return { ok: false, error: "Unknown format" };
  const known = new Set(METRIC_VARIABLES.map((variable) => variable.name).concat(Object.keys(BOOK_KINDS)));
  const unknown = expressionIdentifiers(expression).filter((name) => !known.has(name));
  if (unknown.length) return { ok: false, error: `Unknown value${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}` };
  const probe = evaluateExpression(expression, Object.fromEntries([...known].map((name) => [name, 1])));
  if (!probe.ok) return { ok: false, error: probe.error };
  const scopeRaw = raw.scope && typeof raw.scope === "object" ? (raw.scope as Record<string, unknown>) : null;
  const scope = scopeRaw
    ? {
        homeIds: Array.isArray(scopeRaw.homeIds) ? scopeRaw.homeIds.map(String).slice(0, 200) : undefined,
        types: Array.isArray(scopeRaw.types) ? scopeRaw.types.filter(isPropertyType) : undefined,
      }
    : null;
  let period: MetricDefinition["period"] = null;
  if (typeof raw.period === "string" && raw.period in PERIOD_PRESETS) period = raw.period as PeriodPreset;
  else if (raw.period && typeof raw.period === "object") {
    const candidate = raw.period as Record<string, unknown>;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(candidate.start)) && /^\d{4}-\d{2}-\d{2}$/.test(String(candidate.end))) period = { start: String(candidate.start), end: String(candidate.end) };
  }
  return {
    ok: true,
    definition: {
      title,
      expression,
      format,
      explanation: String(raw.explanation || "").trim().slice(0, 600),
      scope: scope && ((scope.homeIds && scope.homeIds.length) || (scope.types && scope.types.length)) ? scope : null,
      period,
    },
  };
}

// Evaluate a metric against the full data set, honoring per-metric scope/period overrides.
export function evaluateMetric(definition: MetricDefinition, input: { owner: OwnerProfile; homes: OwnerHome[]; entries: BookEntry[]; maintenance: OwnerMaintenance[]; filters: DashboardFilters; now?: Date }) {
  const now = input.now || new Date();
  const homes = filterHomes(input.homes, {
    homeIds: definition.scope?.homeIds?.length ? definition.scope.homeIds : input.filters.homeIds,
    types: definition.scope?.types?.length ? definition.scope.types : input.filters.types,
  });
  let range: DateRange;
  if (!definition.period) range = filtersToRange(input.filters, now);
  else if (typeof definition.period === "string") range = resolvePeriod(definition.period, now);
  else range = { ...definition.period, label: `${definition.period.start} – ${definition.period.end}` };
  const snapshot = buildSnapshot({ owner: input.owner, homes, entries: input.entries, maintenance: input.maintenance, range, totalHomes: input.homes.length });
  const result = evaluateExpression(definition.expression, snapshot.variables);
  return { result, snapshot, range, homes };
}

// ---------- Formatting ----------

export function formatMetric(value: number, format: MetricFormat) {
  if (!Number.isFinite(value)) return "—";
  switch (format) {
    case "currency":
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Math.abs(value) < 100 && value % 1 !== 0 ? 2 : 0 }).format(value);
    case "percent":
      return `${(value * 100).toFixed(Math.abs(value) < 0.1 ? 1 : 0)}%`;
    case "ratio":
      return `${value.toFixed(2)}×`;
    case "months":
      return `${value.toFixed(1)} mo`;
    default:
      return new Intl.NumberFormat("en-US", { maximumFractionDigits: Math.abs(value) < 10 ? 2 : 0 }).format(value);
  }
}

export function moneyCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export function pct(value: number, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`;
}

export function deltaPct(current: number, prior: number) {
  if (!prior) return null;
  return (current - prior) / Math.abs(prior);
}

// ---------- Widgets ----------

export type WidgetSize = "small" | "wide" | "full";
export type WidgetSpec = { id: string; title: string; size: WidgetSize; group: "numbers" | "charts" | "statements" | "operations" | "custom" };

export const WIDGETS: WidgetSpec[] = [
  { id: "kpi_cash_to_owner", title: "Net to you", size: "small", group: "numbers" },
  { id: "kpi_noi", title: "Net operating income", size: "small", group: "numbers" },
  { id: "kpi_rent_collected", title: "Rent collected", size: "small", group: "numbers" },
  { id: "kpi_occupancy", title: "Occupancy", size: "small", group: "numbers" },
  { id: "kpi_collection_rate", title: "Collection rate", size: "small", group: "numbers" },
  { id: "kpi_opex_ratio", title: "Expense ratio", size: "small", group: "numbers" },
  { id: "kpi_maintenance_per_door", title: "Maintenance per door", size: "small", group: "numbers" },
  { id: "kpi_reserve", title: "Reserve on hand", size: "small", group: "numbers" },
  { id: "chart_trend", title: "Income vs. expenses by month", size: "wide", group: "charts" },
  { id: "chart_expense_mix", title: "Where the money went", size: "wide", group: "charts" },
  { id: "pnl", title: "Profit & loss", size: "wide", group: "statements" },
  { id: "cash_flow", title: "Cash flow to owner", size: "wide", group: "statements" },
  { id: "properties", title: "Property results", size: "full", group: "statements" },
  { id: "closings", title: "Closed periods", size: "full", group: "statements" },
  { id: "maintenance", title: "Open maintenance", size: "wide", group: "operations" },
  { id: "leases", title: "Leases & tenants", size: "wide", group: "operations" },
];

export const CUSTOM_WIDGET_PREFIX = "custom:";

export function defaultLayout(customMetrics: CustomMetric[] = []): DashboardLayout {
  return { order: [...customMetrics.map((metric) => `${CUSTOM_WIDGET_PREFIX}${metric.id}`), ...WIDGETS.map((widget) => widget.id)], hidden: [] };
}

// Merge a saved layout with the current widget registry so new widgets appear and removed ones disappear.
export function normalizeLayout(saved: DashboardLayout | null | undefined, customMetrics: CustomMetric[]): DashboardLayout {
  const valid = new Set([...WIDGETS.map((widget) => widget.id), ...customMetrics.map((metric) => `${CUSTOM_WIDGET_PREFIX}${metric.id}`)]);
  const order = (saved?.order || []).filter((id, index, all) => valid.has(id) && all.indexOf(id) === index);
  const missing = [...valid].filter((id) => !order.includes(id));
  // Newly pinned metrics go first so the owner sees them immediately.
  const missingCustom = missing.filter((id) => id.startsWith(CUSTOM_WIDGET_PREFIX));
  const missingBuiltIn = missing.filter((id) => !id.startsWith(CUSTOM_WIDGET_PREFIX));
  const sizes = Object.fromEntries(Object.entries(saved?.sizes || {}).filter(([id]) => valid.has(id)));
  return { order: [...missingCustom, ...order, ...missingBuiltIn], hidden: (saved?.hidden || []).filter((id) => valid.has(id)), sizes };
}

export function parseLayout(input: unknown): DashboardLayout | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const clean = (value: unknown) => (Array.isArray(value) ? value.map(String).slice(0, 200) : []);
  const sizes: Record<string, WidgetSize> = {};
  if (raw.sizes && typeof raw.sizes === "object") {
    for (const [id, size] of Object.entries(raw.sizes as Record<string, unknown>).slice(0, 200)) {
      if (size === "small" || size === "wide" || size === "full") sizes[id] = size;
    }
  }
  return { order: clean(raw.order), hidden: clean(raw.hidden), sizes };
}
