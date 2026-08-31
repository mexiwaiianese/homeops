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
    const propertyNoi = propertyRevenue - propertyExpenses;
    const serviceTypes = new Set(rows.filter(row => row.flow_type === "expense").map(row => row.account_name || "Uncategorized"));
    return { home, rows, revenue: propertyRevenue, expenses: propertyExpenses, noi: propertyNoi, margin: margin(propertyRevenue, propertyNoi), serviceTypes: serviceTypes.size, review: rows.filter(row => row.allocation_status === "review").length };
  }).sort((a, b) => b.noi - a.noi);

  const categoryMap = new Map<string, IntelligenceTransaction[]>();
  transactions.filter(row => row.flow_type === "expense").forEach(row => {
    const category = row.account_name?.trim() || "Uncategorized";
    categoryMap.set(category, [...(categoryMap.get(category) || []), row]);
  });
  const categories = [...categoryMap].map(([name, rows]) => {
    const spend = sum(rows, "expense");
    return { name, spend, share: expenses ? spend / expenses : 0, transactions: rows.length, properties: new Set(rows.map(propertyId).filter(Boolean)).size, vendors: new Set(rows.map(row => row.vendor_name).filter(Boolean)).size };
  }).sort((a, b) => b.spend - a.spend);

  const vendorMap = new Map<string, IntelligenceTransaction[]>();
  transactions.filter(row => row.flow_type === "expense").forEach(row => {
    const vendor = row.vendor_name?.trim() || "Unknown vendor";
    vendorMap.set(vendor, [...(vendorMap.get(vendor) || []), row]);
  });
  const vendors = [...vendorMap].map(([name, rows]) => {
    const spend = sum(rows, "expense");
    return { name, spend, share: expenses ? spend / expenses : 0, transactions: rows.length, average: rows.length ? spend / rows.length : 0, properties: new Set(rows.map(propertyId).filter(Boolean)).size, categories: [...new Set(rows.map(row => row.account_name || "Uncategorized"))] };
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
  if (review.length) insights.push({ severity: "critical", title: `${review.length} transaction${review.length === 1 ? "" : "s"} are not allocated`, detail: "Portfolio and property results are provisional until the controller clears the review queue." });
  properties.filter(item => item.revenue > 0 && item.noi < 0).forEach(item => insights.push({ severity: "critical", title: `${item.home.address1} is operating at a loss`, detail: `Expenses are ${Math.round(item.expenses / item.revenue * 100)}% of revenue for the imported period.` }));
  properties.filter(item => item.revenue === 0 && item.expenses > 0).forEach(item => insights.push({ severity: "watch", title: `${item.home.address1} has expenses but no income`, detail: "Check vacancy, missing rent transactions, or property mapping." }));
  const topVendor = vendors[0];
  if (topVendor && topVendor.share >= .3) insights.push({ severity: "watch", title: `Vendor concentration: ${topVendor.name}`, detail: `${Math.round(topVendor.share * 100)}% of imported expenses are with one vendor. Compare pricing and confirm backup coverage.` });
  const uncategorized = categories.find(category => category.name === "Uncategorized");
  if (uncategorized) insights.push({ severity: "watch", title: `${uncategorized.transactions} expense${uncategorized.transactions === 1 ? "" : "s"} lack a service type`, detail: "Categorize these transactions before evaluating vendor performance by trade." });
  if (!insights.length) insights.push({ severity: "good", title: "No material exceptions detected", detail: "All imported transactions are allocated and no property-level loss or vendor concentration threshold was triggered." });

  return { revenue, expenses, noi, margin: margin(revenue, noi), overhead, review: review.length, properties, categories, vendors, months, insights };
}
