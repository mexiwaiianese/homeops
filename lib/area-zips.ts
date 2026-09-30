/** ZIP codes for a recruitment city, county, or state. No Google Places. */

export function normalizeCityName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\bst\.?\s+/g, "saint ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function areaKey(city: string, state: string) {
  return `${state.trim().toUpperCase()}|${normalizeCityName(city)}`;
}

export const RECRUITMENT_AREAS: Array<{ city: string; state: string; county: string; zips: string[] }> = [
  { city: "Alpine", state: "UT", county: "Utah County", zips: ["84004"] },
  { city: "American Fork", state: "UT", county: "Utah County", zips: ["84003"] },
  { city: "Cedar Hills", state: "UT", county: "Utah County", zips: ["84062"] },
  { city: "Draper", state: "UT", county: "Salt Lake County", zips: ["84020"] },
  { city: "Eagle Mountain", state: "UT", county: "Utah County", zips: ["84005"] },
  { city: "Highland", state: "UT", county: "Utah County", zips: ["84003"] },
  { city: "Lehi", state: "UT", county: "Utah County", zips: ["84043", "84045"] },
  { city: "Lindon", state: "UT", county: "Utah County", zips: ["84042"] },
  { city: "Orem", state: "UT", county: "Utah County", zips: ["84057", "84058", "84097"] },
  { city: "Pleasant Grove", state: "UT", county: "Utah County", zips: ["84062"] },
  { city: "Provo", state: "UT", county: "Utah County", zips: ["84601", "84604", "84606"] },
  { city: "Salt Lake City", state: "UT", county: "Salt Lake County", zips: ["84101", "84102", "84103", "84104", "84105", "84106", "84111", "84115", "84116"] },
  { city: "Sandy", state: "UT", county: "Salt Lake County", zips: ["84070", "84092", "84093", "84094"] },
  { city: "Saratoga Springs", state: "UT", county: "Utah County", zips: ["84045"] },
];

const GAZETTEER: Record<string, string[]> = Object.fromEntries(
  RECRUITMENT_AREAS.map((area) => [areaKey(area.city, area.state), area.zips]),
);

export function citiesForState(state: string) {
  const code = state.trim().toUpperCase();
  return RECRUITMENT_AREAS.filter((area) => area.state === code).map((area) => area.city);
}

export function countiesForState(state: string) {
  const code = state.trim().toUpperCase();
  return [...new Set(RECRUITMENT_AREAS.filter((area) => area.state === code).map((area) => area.county))];
}

export function citiesForCounty(state: string, county: string) {
  const code = state.trim().toUpperCase();
  const name = county.trim();
  return RECRUITMENT_AREAS.filter((area) => area.state === code && area.county === name).map((area) => area.city);
}

function uniqueZips(values: string[]) {
  return [...new Set(values.map((zip) => zip.replace(/\D/g, "").slice(0, 5)).filter((zip) => zip.length === 5))].sort();
}

async function zipsFromZippopotam(city: string, state: string) {
  const url = `https://api.zippopotam.us/us/${encodeURIComponent(state.trim().toLowerCase())}/${encodeURIComponent(city.trim().toLowerCase())}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return [];
    const body = (await response.json()) as { places?: Array<{ "post code"?: string }> };
    return uniqueZips((body.places ?? []).map((place) => place["post code"] || ""));
  } catch {
    return [];
  }
}

export async function zipsForCityState(city: string, state: string) {
  const gazetteer = GAZETTEER[areaKey(city, state)] ?? [];
  const remote = await zipsFromZippopotam(city, state);
  const zips = uniqueZips([...gazetteer, ...remote]);
  return {
    zips,
    source: remote.length && gazetteer.length ? "merged" : remote.length ? "zippopotam" : gazetteer.length ? "gazetteer" : "none",
  } as const;
}

export async function zipsForRecruitmentArea(input: { city?: string | null; county?: string | null; state: string }) {
  const state = input.state.trim().toUpperCase().slice(0, 2);
  const county = (input.county ?? "").trim();
  const city = (input.city ?? "").trim();
  if (county) {
    const zips = uniqueZips(citiesForCounty(state, county).flatMap((name) => GAZETTEER[areaKey(name, state)] ?? []));
    return {
      zips,
      place: county,
      cities: citiesForCounty(state, county),
      source: zips.length ? "gazetteer" as const : "none" as const,
    };
  }
  const area = await zipsForCityState(city, state);
  return { zips: area.zips, place: city, cities: city ? [city] : [], source: area.source };
}

export function tradeQueriesForArea(input: {
  queries: string[];
  city: string;
  state: string;
  zips: string[];
}) {
  const location = [input.city.trim(), input.state.trim().toUpperCase()].filter(Boolean).join(", ");
  const zipTail = input.zips.join(" ");
  return input.queries.map((query) => [query, location, zipTail].filter(Boolean).join(" ").replace(/\s+/g, " ").trim());
}

export function postalInArea(postalCode: string | null | undefined, zips: string[]) {
  const zip = (postalCode ?? "").replace(/\D/g, "").slice(0, 5);
  return Boolean(zip && zips.includes(zip));
}

export function cityStateMatch(
  row: { city?: string | null; state?: string | null },
  city: string,
  state: string,
) {
  const rowState = (row.state ?? "").trim().toUpperCase();
  if (rowState && rowState !== state.trim().toUpperCase()) return false;
  return normalizeCityName(row.city ?? "") === normalizeCityName(city);
}
