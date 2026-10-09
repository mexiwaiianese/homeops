import { RECRUITMENT_TRADES } from "@/lib/vendor-prospects";

export const ACCOUNT_TRADES = RECRUITMENT_TRADES.map((trade) => ({ slug: trade.slug, name: trade.name }));

const byName = new Map<string, string>(ACCOUNT_TRADES.map((trade) => [trade.name.toLowerCase(), trade.slug]));
const bySlug = new Map<string, string>(ACCOUNT_TRADES.map((trade) => [trade.slug, trade.name]));

export function splitTradeNames(names: string[]) {
  const selected: string[] = [];
  const other: string[] = [];
  for (const name of names) {
    const clean = name.trim();
    if (!clean) continue;
    const slug = byName.get(clean.toLowerCase());
    if (slug) selected.push(slug);
    else other.push(clean);
  }
  return { selected: [...new Set(selected)], other: [...new Set(other)] };
}

/** Listed trades plus any extra names, in a stable order and without duplicates. */
export function collectTradeNames(slugs: string[], other: string) {
  const listed: string[] = [];
  for (const slug of slugs) {
    const name = bySlug.get(slug);
    if (name) listed.push(name);
  }
  const extras = other.split(",").map((name) => name.trim()).filter((name) => name.length > 0);
  return [...new Set([...listed, ...extras])];
}
