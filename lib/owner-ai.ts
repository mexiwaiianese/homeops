import type { MetricVariables } from "@/lib/metric-expression";
import {
  METRIC_VARIABLES,
  PERIOD_PRESETS,
  PROPERTY_TYPES,
  validateMetricDefinition,
  type MetricDefinition,
  type MetricFormat,
  type OwnerHome,
  type PeriodPreset,
  type PropertyType,
} from "@/lib/owner-portal";

export function ownerAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export type AskInput = {
  prompt: string;
  homes: OwnerHome[];
  variables: MetricVariables; // current snapshot under the owner's filters (dollars, ratios, counts)
  periodLabel: string;
};

export type AskResult =
  | { ok: true; definition: MetricDefinition; source: "ai" | "local"; note?: string }
  | { ok: false; error: string; source: "ai" | "local" };

// The model only ever returns a formula over a fixed vocabulary; the app does the math.
// That keeps every "AI" number reproducible, pinnable, and re-evaluated as filters change.
function systemPrompt(input: AskInput) {
  const variables = METRIC_VARIABLES.map((variable) => `- ${variable.name} (${variable.unit}): ${variable.description}`).join("\n");
  const homes = input.homes.map((home) => `- id "${home.id}": ${home.address1}, ${home.city} (${PROPERTY_TYPES[home.type]}, rent $${(home.rentCents / 100).toFixed(0)}/mo, ${home.occupied ? "occupied" : "vacant"})`).join("\n");
  const snapshot = Object.entries(input.variables)
    .filter(([name]) => METRIC_VARIABLES.some((variable) => variable.name === name))
    .map(([name, value]) => `${name}=${Number.isInteger(value) ? value : value.toFixed(4)}`)
    .join(", ");
  return `You translate a rental property owner's question into ONE metric definition for their dashboard.
Respond with strict JSON only, no prose, matching:
{"title": string (<= 60 chars), "format": "currency"|"percent"|"number"|"ratio"|"months", "expression": string, "explanation": string (<= 2 sentences, plain English, mention the formula), "scope": {"homeIds": string[], "types": string[]} | null, "period": ${Object.keys(PERIOD_PRESETS).map((key) => `"${key}"`).join("|")} | {"start":"YYYY-MM-DD","end":"YYYY-MM-DD"} | null}

Rules:
- "expression" may only use numbers, + - * / ^ ( ), the functions min max abs round floor ceil sqrt div avg sum, and these variables (dollar values are dollars, not cents):
${variables}
- Ratios like occupancy, collection_rate, noi_margin, opex_ratio are already 0-1 fractions; use format "percent" for them.
- Use "months" format for things like "months of expenses covered by reserves" (reserve_balance / (operating_expenses / months)).
- Set "scope" only when the owner names specific properties or a property type; otherwise null so the metric follows their dashboard filters. Property types: ${Object.keys(PROPERTY_TYPES).join(", ")}.
- Set "period" only when the owner names a time frame (e.g. "this year" -> "ytd", "last quarter" -> "last_quarter", "last 12 months" -> "t12"); otherwise null.
- Never invent variables. If the request cannot be computed from these variables, return {"error": "short reason"}.

Owner's properties:
${homes || "- (none)"}

Current values under the owner's filters (${input.periodLabel}): ${snapshot}`;
}

export async function askOwnerAi(input: AskInput): Promise<AskResult> {
  const prompt = input.prompt.trim();
  if (!prompt) return { ok: false, error: "Ask a question first.", source: "local" };
  if (!ownerAiConfigured()) {
    const local = localInterpret(input);
    return local.ok ? { ...local, note: "Interpreted locally. Set OPENAI_API_KEY for natural-language requests." } : local;
  }
  try {
    const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt(input) },
          { role: "user", content: prompt.slice(0, 1000) },
        ],
      }),
    }).finally(() => clearTimeout(timer));
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const local = localInterpret(input);
      if (local.ok) return { ...local, note: "AI service unavailable; interpreted locally." };
      return { ok: false, error: `AI request failed (${response.status}). ${text.slice(0, 200)}`, source: "ai" };
    }
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    if (parsed?.error) return { ok: false, error: String(parsed.error), source: "ai" };
    const validated = validateMetricDefinition(parsed);
    if (!validated.ok) {
      const local = localInterpret(input);
      if (local.ok) return { ...local, note: `AI answer was not computable (${validated.error}); interpreted locally.` };
      return { ok: false, error: validated.error, source: "ai" };
    }
    return { ok: true, definition: validated.definition, source: "ai" };
  } catch (error) {
    const local = localInterpret(input);
    if (local.ok) return { ...local, note: "AI service timed out; interpreted locally." };
    return { ok: false, error: error instanceof Error ? error.message : "AI request failed", source: "ai" };
  }
}

// ---------- Local interpreter (no API key) ----------
// Handles the common owner asks: "X per door", "X as a percent of income", "X divided by Y",
// "months of reserves", "average rent", plus property / type / period mentions.

type Synonym = { pattern: RegExp; variable: string; label: string; format: MetricFormat };

const SYNONYMS: Synonym[] = [
  { pattern: /\b(net to (me|owner)|cash to (me|owner)|what (i|we) (got|received|took home)|distributable|take[- ]?home)\b/i, variable: "net_to_owner", label: "Net to owner", format: "currency" },
  { pattern: /\bnoi\b|net operating income|operating income/i, variable: "noi", label: "NOI", format: "currency" },
  { pattern: /\bcash ?flow\b/i, variable: "cash_flow", label: "Cash flow", format: "currency" },
  { pattern: /\b(disburse|draws?|distributions?|payouts?|sent to me)\b/i, variable: "disbursements", label: "Disbursements", format: "currency" },
  { pattern: /\bcontributions?\b|money i put in/i, variable: "contributions", label: "Owner contributions", format: "currency" },
  { pattern: /\bmanagement fees?\b/i, variable: "management_fees", label: "Management fees", format: "currency" },
  { pattern: /\b(capex|capital)\b/i, variable: "capital_expenses", label: "Capital expenses", format: "currency" },
  { pattern: /\bhvac\b|heating|air ?condition/i, variable: "hvac", label: "HVAC spend", format: "currency" },
  { pattern: /\bplumb/i, variable: "plumbing", label: "Plumbing spend", format: "currency" },
  { pattern: /\blandscap|lawn|yard\b/i, variable: "landscaping", label: "Landscaping spend", format: "currency" },
  { pattern: /\bturnover|make[- ]?ready\b/i, variable: "turnover", label: "Turnover spend", format: "currency" },
  { pattern: /\binsurance\b/i, variable: "insurance", label: "Insurance", format: "currency" },
  { pattern: /\b(property )?tax(es)?\b/i, variable: "taxes", label: "Property taxes", format: "currency" },
  { pattern: /\bhoa\b|association/i, variable: "hoa", label: "HOA dues", format: "currency" },
  { pattern: /\butilit/i, variable: "utilities", label: "Utilities", format: "currency" },
  { pattern: /\b(repairs?|maintenance)\b/i, variable: "maintenance", label: "Maintenance spend", format: "currency" },
  { pattern: /\b(operating )?expenses?\b|\bopex\b|\bspend(ing)?\b|\bcosts?\b/i, variable: "operating_expenses", label: "Operating expenses", format: "currency" },
  { pattern: /\blate fees?\b/i, variable: "late_fees", label: "Late fees", format: "currency" },
  { pattern: /\bscheduled rent\b|rent (due|owed|expected)/i, variable: "scheduled_rent", label: "Scheduled rent", format: "currency" },
  { pattern: /\b(rent )?outstanding\b|\bpast due\b|\bdelinquen|\bowes?\b|\barrears\b/i, variable: "rent_outstanding", label: "Rent outstanding", format: "currency" },
  { pattern: /\brent collected\b|\bcollected rent\b|\brent\b/i, variable: "rent_collected", label: "Rent collected", format: "currency" },
  { pattern: /\b(income|revenue|gross)\b/i, variable: "income", label: "Income", format: "currency" },
  { pattern: /\breserves?\b/i, variable: "reserve_balance", label: "Reserve balance", format: "currency" },
  { pattern: /\bdeposits?\b/i, variable: "deposits_held", label: "Deposits held", format: "currency" },
  { pattern: /\bvacan(t|cy)\b/i, variable: "vacant_doors", label: "Vacant doors", format: "number" },
  { pattern: /\boccupan/i, variable: "occupancy", label: "Occupancy", format: "percent" },
  { pattern: /\bcollection rate\b/i, variable: "collection_rate", label: "Collection rate", format: "percent" },
  { pattern: /\bmargin\b/i, variable: "noi_margin", label: "NOI margin", format: "percent" },
  { pattern: /\bopen (work|maintenance|requests?|tickets?)\b|\bwork orders?\b/i, variable: "open_maintenance", label: "Open maintenance", format: "number" },
  { pattern: /\b(doors|properties|homes|units)\b/i, variable: "doors", label: "Doors", format: "number" },
];

function findVariables(text: string) {
  const found: Array<Synonym & { index: number }> = [];
  for (const synonym of SYNONYMS) {
    const match = synonym.pattern.exec(text);
    if (match && !found.some((item) => item.variable === synonym.variable)) found.push({ ...synonym, index: match.index });
  }
  return found.sort((a, b) => a.index - b.index);
}

function detectPeriod(text: string): PeriodPreset | null {
  if (/\b(this|current) month\b/i.test(text)) return "this_month";
  if (/\blast month\b/i.test(text)) return "last_month";
  if (/\blast quarter\b/i.test(text)) return "last_quarter";
  if (/\b(this quarter|quarter to date|qtd)\b/i.test(text)) return "qtd";
  if (/\blast year\b/i.test(text)) return "last_year";
  if (/\b(this year|year to date|ytd)\b/i.test(text)) return "ytd";
  if (/\b(trailing|last|past) (12|twelve) months\b|\bt12\b|\bttm\b/i.test(text)) return "t12";
  if (/\b(all[- ]time|since (the )?(start|beginning)|ever)\b/i.test(text)) return "all";
  return null;
}

function detectScope(text: string, homes: OwnerHome[]) {
  const homeIds = homes.filter((home) => {
    const number = home.address1.split(" ")[0];
    const street = home.address1.toLowerCase();
    return text.toLowerCase().includes(street) || (number && new RegExp(`\\b${number}\\b`).test(text) && new RegExp(street.split(" ").slice(1, 2).join(" "), "i").test(text));
  }).map((home) => home.id);
  const types = (Object.keys(PROPERTY_TYPES) as PropertyType[]).filter((type) => {
    const label = PROPERTY_TYPES[type].toLowerCase();
    return text.toLowerCase().includes(label) || text.toLowerCase().includes(label.replace(" ", "-")) || (type === "single_family" && /\bsfh\b|single[- ]family/i.test(text)) || (type === "condo" && /\bcondos?\b/i.test(text)) || (type === "townhome" && /\btown ?(home|house)s?\b/i.test(text));
  });
  return homeIds.length || types.length ? { homeIds: homeIds.length ? homeIds : undefined, types: types.length ? types : undefined } : null;
}

export function localInterpret(input: AskInput): AskResult {
  const text = input.prompt.trim();
  const period = detectPeriod(text);
  const scope = detectScope(text, input.homes);
  const found = findVariables(text);
  const fail = (error: string): AskResult => ({ ok: false, error, source: "local" });
  if (!found.length) return fail("I could not map that to a known value. Try wording like \"maintenance per door\", \"NOI as a percent of income\", or \"months of reserves\".");

  const primary = found[0];
  const secondary = found[1];
  let expression = primary.variable;
  let title = primary.label;
  let format: MetricFormat = primary.format;
  let explanation = `${primary.label} for the selected period.`;

  const perDoor = /\bper (door|property|home|unit)\b/i.test(text);
  const perMonth = /\bper month\b|\bmonthly average\b|\baverage (monthly|per month)\b/i.test(text);
  const monthsOf = /\bmonths? of\b|\bhow many months\b|\brunway\b/i.test(text);
  const percentOf = /\b(as a )?(percent|percentage|%|share|ratio) of\b/i.test(text) || /\bratio\b/i.test(text);
  const versus = /\b(vs\.?|versus|compared to|change from|growth)\b/i.test(text) && /\b(prior|previous|last)\b/i.test(text);
  const average = /\baverage\b|\bavg\b|\bmean\b/i.test(text);
  const divided = /\bdivided by\b|\bover\b|\b\/\b/i.test(text);

  if (monthsOf && found.some((item) => item.variable === "reserve_balance")) {
    expression = "div(reserve_balance, div(operating_expenses, months))";
    title = "Months of expenses covered by reserves";
    format = "months";
    explanation = "Reserve balance divided by average monthly operating expenses in the selected period.";
  } else if (versus) {
    const priorName = primary.variable === "income" || primary.variable === "rent_collected" ? "prior_income" : primary.variable === "noi" ? "prior_noi" : primary.variable === "operating_expenses" ? "prior_operating_expenses" : null;
    if (!priorName) return fail("Period-over-period comparisons are available for income, NOI, and operating expenses.");
    const base = priorName === "prior_income" ? "income" : primary.variable;
    expression = `div(${base} - ${priorName}, abs(${priorName}))`;
    title = `${primary.label} vs. prior period`;
    format = "percent";
    explanation = `Change in ${primary.label.toLowerCase()} compared with the same-length period immediately before.`;
  } else if (percentOf && secondary) {
    expression = `div(${primary.variable}, ${secondary.variable})`;
    title = `${primary.label} as % of ${secondary.label.toLowerCase()}`;
    format = "percent";
    explanation = `${primary.label} divided by ${secondary.label.toLowerCase()}.`;
  } else if (percentOf && !secondary) {
    expression = `div(${primary.variable}, income)`;
    title = `${primary.label} as % of income`;
    format = "percent";
    explanation = `${primary.label} divided by total income.`;
  } else if (divided && secondary) {
    expression = `div(${primary.variable}, ${secondary.variable})`;
    title = `${primary.label} ÷ ${secondary.label.toLowerCase()}`;
    format = secondary.format === "number" && primary.format === "currency" ? "currency" : "ratio";
    explanation = `${primary.label} divided by ${secondary.label.toLowerCase()}.`;
  } else if (average && primary.variable === "rent_collected") {
    expression = "avg_rent";
    title = "Average monthly rent";
    format = "currency";
    explanation = "Average monthly rent across occupied doors in scope.";
  }

  if (perDoor && !expression.includes("doors")) {
    expression = `div(${expression}, doors)`;
    title = `${title} per door`;
    explanation += " Divided by the number of properties in scope.";
  }
  if (perMonth && !expression.includes("months")) {
    expression = `div(${expression}, months)`;
    title = `${title} per month`;
    explanation += " Divided by the months in the period.";
  }
  if (/\bannual(ized)?\b/i.test(text) && !expression.includes("months")) {
    expression = `div(${expression}, months) * 12`;
    title = `Annualized ${title.toLowerCase()}`;
    explanation += " Annualized from the selected period.";
  }

  const validated = validateMetricDefinition({ title, format, expression, explanation, scope, period });
  if (!validated.ok) return fail(validated.error);
  return { ok: true, definition: validated.definition, source: "local" };
}
