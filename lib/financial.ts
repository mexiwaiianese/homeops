export type FinancialHome = { id: string; address1: string; city: string; state: string; property_code?: string | null };
export type ImportMapping = {
  date: string; description?: string; vendor?: string; amount?: string; debit?: string; credit?: string;
  account?: string; qbClass?: string; qbLocation?: string; customerProject?: string; memo?: string;
  positiveMeans?: "expense" | "income";
};

export function normalize(v: unknown) {
  return String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function dollarsToCents(v: unknown) {
  const n = Number(String(v ?? "").replace(/[$,()]/g, (m) => m === "(" ? "-" : m === ")" ? "" : "").trim());
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function canonicalAmount(row: Record<string, string>, mapping: ImportMapping) {
  let signed = 0;
  if (mapping.amount) signed = dollarsToCents(row[mapping.amount]);
  else {
    const debit = mapping.debit ? Math.abs(dollarsToCents(row[mapping.debit])) : 0;
    const credit = mapping.credit ? Math.abs(dollarsToCents(row[mapping.credit])) : 0;
    signed = debit - credit;
  }
  const positiveMeans = mapping.positiveMeans ?? "expense";
  const flow_type = signed === 0 ? "expense" : (signed > 0 ? positiveMeans : positiveMeans === "expense" ? "income" : "expense");
  return { amount_cents: Math.abs(signed), flow_type };
}

export function matchHome(row: Record<string,string>, mapping: ImportMapping, homes: FinancialHome[]) {
  const fields = [mapping.qbClass, mapping.qbLocation, mapping.customerProject, mapping.description, mapping.memo]
    .filter(Boolean).map((k) => String(row[k as string] ?? ""));
  for (const home of homes) {
    const needles = [home.property_code, home.address1, `${home.address1} ${home.city}`, `${home.address1} ${home.city} ${home.state}`]
      .filter(Boolean).map(normalize).filter((x) => x.length >= 5);
    for (const field of fields) {
      const f = normalize(field);
      if (needles.some((n) => f === n || f.includes(n))) {
        return { propertyId: home.id, confidence: f === needles[1] ? 1 : .92, reason: `Matched property from QuickBooks dimension/text: ${field}` };
      }
    }
  }
  return { propertyId: null, confidence: 0, reason: "No reliable property match" };
}
