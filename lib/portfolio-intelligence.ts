export type IntelligenceHome = { id: string; address1: string; city: string; state: string; property_code?: string | null };

export type IntelligenceTransaction = {
  id: string;
  tx_date: string;
  vendor_name?: string | null;
  description?: string | null;
  account_name?: string | null;
  amount_cents: number;
  flow_type: "income" | "expense";
  allocation_status: "matched" | "review" | "overhead";
  match_confidence: number;
  homes?: IntelligenceHome | null;
  property_id?: string | null;
};

export type Insight = { severity: "critical" | "watch" | "good"; title: string; detail: string };

const propertyId = (transaction: IntelligenceTransaction) => transaction.homes?.id || transaction.property_id || null;
const sum = (rows: IntelligenceTransaction[], flow: "income" | "expense") => rows.filter(row => row.flow_type === flow).reduce((total, row) => total + row.amount_cents, 0);
const margin = (revenue: number, noi: number) => revenue ? noi / revenue : 0;
const categoryRules: [RegExp, string, "Operating" | "Capital"][] = [
  [/roof|foundation|renovation|remodel|capital|appliance replacement|water heater replacement/i, "Capital improvements", "Capital"],
  [/plumb|drain|water heater/i, "Plumbing", "Operating"],
  [/hvac|heating|cooling|air condition/i, "HVAC", "Operating"],
  [/landscap|lawn|snow|yard/i, "Landscaping", "Operating"],
  [/turnover|make ready|paint|clean/i, "Turnover", "Operating"],
  [/hoa|association/i, "HOA", "Operating"],
  [/tax/i, "Property taxes", "Operating"],
  [/insurance/i, "Insurance", "Operating"],
  [/management/i, "Management fees", "Operating"],
  [/software|subscription/i, "Software", "Operating"],
  [/repair|maintenance|suppl/i, "Repairs & maintenance", "Operating"],
];
export function normalizeServiceType(value?: string | null) {
  const name = value?.trim() || "Uncategorized";
  const rule = categoryRules.find(([pattern]) => pattern.test(name));
  return { name: rule?.[1] || name.replace(/\b\w/g, letter => letter.toUpperCase()), expenseClass: rule?.[2] || "Operating" as "Operating" | "Capital" };
}

export function buildPortfolioIntelligence(homes: IntelligenceHome[], transactions: IntelligenceTransaction[]) {
  const revenue = sum(transactions, "income");
  const expenses = sum(transactions, "expense");
  const noi = revenue - expenses;
  const review = transactions.filter(row => row.allocation_status === "review");
  const overhead = transactions.filter(row => row.allocation_status === "overhead" && row.flow_type === "expense").reduce((total, row) => total + row.amount_cents, 0);

  const properties = homes.map(home => {
    const rows = transactions.filter(row => propertyId(row) === home.id);
    const propertyRevenue = sum(rows, "income");
    const propertyExpenses = sum(rows, "expense");
    const propertyCapitalExpenses = rows.filter(row => row.flow_type === "expense" && normalizeServiceType(row.account_name).expenseClass === "Capital").reduce((total, row) => total + row.amount_cents, 0);
    const propertyOperatingExpenses = propertyExpenses - propertyCapitalExpenses;
    const propertyNoi = propertyRevenue - propertyOperatingExpenses;
    const serviceTypes = new Set(rows.filter(row => row.flow_type === "expense").map(row => normalizeServiceType(row.account_name).name));
    return { home, rows, revenue: propertyRevenue, expenses: propertyExpenses, operatingExpenses: propertyOperatingExpenses, capitalExpenses: propertyCapitalExpenses, noi: propertyNoi, cashResult: propertyRevenue - propertyExpenses, margin: margin(propertyRevenue, propertyNoi), serviceTypes: serviceTypes.size, review: rows.filter(row => row.allocation_status === "review").length };
  }).sort((a, b) => b.noi - a.noi);

  const categoryMap = new Map<string, IntelligenceTransaction[]>();
  transactions.filter(row => row.flow_type === "expense").forEach(row => {
    const category = normalizeServiceType(row.account_name).name;
    categoryMap.set(category, [...(categoryMap.get(category) || []), row]);
  });
  const categories = [...categoryMap].map(([name, rows]) => {
    const spend = sum(rows, "expense");
    const propertyCount = new Set(rows.map(propertyId).filter(Boolean)).size;
    return { name, expenseClass: normalizeServiceType(rows[0]?.account_name).expenseClass, spend, share: expenses ? spend / expenses : 0, transactions: rows.length, properties: propertyCount, vendors: new Set(rows.map(row => row.vendor_name).filter(Boolean)).size, averageInvoice: rows.length ? spend / rows.length : 0, averageProperty: propertyCount ? spend / propertyCount : 0 };
  }).sort((a, b) => b.spend - a.spend);

  const vendorMap = new Map<string, IntelligenceTransaction[]>();
  transactions.filter(row => row.flow_type === "expense").forEach(row => {
    const vendor = row.vendor_name?.trim() || "Unknown vendor";
    vendorMap.set(vendor, [...(vendorMap.get(vendor) || []), row]);
  });
  const vendors = [...vendorMap].map(([name, rows]) => {
    const spend = sum(rows, "expense");
    return { name, spend, share: expenses ? spend / expenses : 0, transactions: rows.length, average: rows.length ? spend / rows.length : 0, properties: new Set(rows.map(propertyId).filter(Boolean)).size, categories: [...new Set(rows.map(row => normalizeServiceType(row.account_name).name))] };
  }).sort((a, b) => b.spend - a.spend);

  const monthMap = new Map<string, IntelligenceTransaction[]>();
  transactions.forEach(row => {
    const month = row.tx_date.slice(0, 7);
    monthMap.set(month, [...(monthMap.get(month) || []), row]);
  });
  const months = [...monthMap].map(([month, rows]) => {
    const monthRevenue = sum(rows, "income");
    const monthExpenses = sum(rows, "expense");
    return { month, revenue: monthRevenue, expenses: monthExpenses, noi: monthRevenue - monthExpenses };
  }).sort((a, b) => a.month.localeCompare(b.month));

  const insights: Insight[] = [];
  const capitalExpenses = transactions.filter(row => row.flow_type === "expense" && normalizeServiceType(row.account_name).expenseClass === "Capital").reduce((total, row) => total + row.amount_cents, 0);
  const operatingExpenses = expenses - capitalExpenses;
  const operatingNoi = revenue - operatingExpenses;
  const latestMonth = months.at(-1);
  const priorMonth = months.at(-2);
  const duplicateGroups = new Map<string, IntelligenceTransaction[]>();
  transactions.forEach(row => {
    const key = [row.tx_date, row.vendor_name?.trim().toLowerCase(), row.amount_cents, row.flow_type].join("|");
    duplicateGroups.set(key, [...(duplicateGroups.get(key) || []), row]);
  });
  const duplicateCandidates = [...duplicateGroups.values()].filter(rows => rows.length > 1);
  if (review.length) insights.push({ severity: "critical", title: `${review.length} transaction${review.length === 1 ? "" : "s"} are not allocated`, detail: "Portfolio and property results are provisional until the controller clears the review queue." });
  properties.filter(item => item.revenue > 0 && item.noi < 0).forEach(item => insights.push({ severity: "critical", title: `${item.home.address1} is operating at a loss`, detail: `Expenses are ${Math.round(item.expenses / item.revenue * 100)}% of revenue for the imported period.` }));
  properties.filter(item => item.revenue === 0 && item.expenses > 0).forEach(item => insights.push({ severity: "watch", title: `${item.home.address1} has expenses but no income`, detail: "Check vacancy, missing rent transactions, or property mapping." }));
  const topVendor = vendors[0];
  if (topVendor && topVendor.share >= .3) insights.push({ severity: "watch", title: `Vendor concentration: ${topVendor.name}`, detail: `${Math.round(topVendor.share * 100)}% of imported expenses are with one vendor. Compare pricing and confirm backup coverage.` });
  const uncategorized = categories.find(category => category.name === "Uncategorized");
  if (uncategorized) insights.push({ severity: "watch", title: `${uncategorized.transactions} expense${uncategorized.transactions === 1 ? "" : "s"} lack a service type`, detail: "Categorize these transactions before evaluating vendor performance by trade." });
  duplicateCandidates.forEach(rows => insights.push({ severity: "watch", title: "Possible duplicate transaction", detail: `${rows.length} entries match ${rows[0].vendor_name || "the same vendor"}, date, amount, and flow. Verify before reporting.` }));
  if (latestMonth && priorMonth && latestMonth.expenses > priorMonth.expenses * 1.5 && latestMonth.expenses - priorMonth.expenses > 50000) insights.push({ severity: "watch", title: "Monthly expense spike", detail: `Expenses increased ${Math.round((latestMonth.expenses / Math.max(priorMonth.expenses, 1) - 1) * 100)}% from the prior imported month.` });
  const importedMonths = months.map(month => month.month);
  properties.forEach(item => importedMonths.forEach(month => {
    const hasIncome = item.rows.some(row => row.flow_type === "income" && row.tx_date.startsWith(month));
    if (!hasIncome && item.rows.some(row => row.tx_date.startsWith(month))) insights.push({ severity: "watch", title: `Missing income: ${item.home.address1}`, detail: `No income is mapped for ${month}, although the property has expense activity. Check vacancy or import mapping.` });
  }));
  categories.forEach(category => {
    const categoryVendors = vendors.filter(vendor => vendor.categories.includes(category.name) && vendor.transactions >= 2);
    if (categoryVendors.length >= 2) {
      const baseline = categoryVendors.reduce((total, vendor) => total + vendor.average, 0) / categoryVendors.length;
      categoryVendors.filter(vendor => vendor.average > baseline * 1.5).forEach(vendor => insights.push({ severity: "watch", title: `High average invoice: ${vendor.name}`, detail: `${moneyText(vendor.average)} average for ${category.name}, more than 50% above the portfolio vendor average.` }));
    }
  });
  if (!insights.length) insights.push({ severity: "good", title: "No material exceptions detected", detail: "All imported transactions are allocated and no property-level loss or vendor concentration threshold was triggered." });

  return { revenue, expenses, noi, margin: margin(revenue, noi), overhead, operatingExpenses, capitalExpenses, operatingNoi, review: review.length, properties, categories, vendors, months, latestMonth, priorMonth, duplicateCandidates: duplicateCandidates.length, insights };
}

const moneyText = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
