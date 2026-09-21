import { explainVendorEligibility, type EligibilityResult } from "@/lib/vendors";

export type AutoAssignCandidate = {
  id: string;
  name: string;
  trade?: string | null;
  services?: string[];
  approval_status?: string | null;
  emergency_available?: boolean | null;
  expected_response_minutes?: number | null;
  minimum_trip_charge_cents?: number | null;
  hourly_rate_cents?: number | null;
  eligibility?: EligibilityResult;
  vendor_owner_preferences?: Array<{ preference?: string | null }>;
  vendor_property_preferences?: Array<{ preference?: string | null }>;
};

export type AutoAssignPick = {
  vendor: AutoAssignCandidate;
  score: number;
  impliedCostCents: number | null;
  reasons: string[];
};

function impliedCostCents(vendor: AutoAssignCandidate) {
  const trip = Number(vendor.minimum_trip_charge_cents ?? 0);
  const hourly = Number(vendor.hourly_rate_cents ?? 0);
  if (!trip && !hourly) return null;
  return trip + hourly;
}

export function serviceFits(vendor: AutoAssignCandidate, title?: string) {
  const hay = `${vendor.trade ?? ""} ${(vendor.services ?? []).join(" ")}`.toLowerCase();
  const text = (title ?? "").toLowerCase();
  if (!text || !hay) return true;
  const pairs: Array<[RegExp, RegExp]> = [
    [/drywall|patch|paint|handyman|general/, /general|handyman|maintenance|drywall/],
    [/heat|furnace|ac|hvac|air/, /hvac|heat|furnace|air/],
    [/plumb|leak|water heater|disposal|drain|toilet/, /plumb|water/],
    [/electric|outlet|breaker|panel/, /electric/],
    [/roof|gutter/, /roof/],
    [/pest|bug|rodent/, /pest/],
    [/lock|rekey/, /lock/],
    [/flood|water damage|restore/, /restor|water/],
  ];
  const matched = pairs.find(([need]) => need.test(text));
  if (!matched) return true;
  return matched[1].test(hay);
}

function rankingReasons(vendor: AutoAssignCandidate, emergency: boolean) {
  const eligibility = vendor.eligibility ?? explainVendorEligibility(vendor);
  const reasons = [...(eligibility.signals ?? [])];
  if (emergency && vendor.emergency_available) reasons.push("Emergency available");
  const cost = impliedCostCents(vendor);
  if (cost != null) reasons.push(`Published rate floor ${(cost / 100).toFixed(0)} dollars`);
  return reasons;
}

export function pickAutoAssignVendor(input: {
  vendors: AutoAssignCandidate[];
  budgetCents: number | null;
  emergency?: boolean;
  title?: string;
}): { pick: AutoAssignPick | null; skipped: Array<{ id: string; name: string; reasons: string[] }> } {
  const skipped: Array<{ id: string; name: string; reasons: string[] }> = [];
  const ranked: AutoAssignPick[] = [];

  for (const vendor of input.vendors) {
    const eligibility = vendor.eligibility ?? explainVendorEligibility(vendor);
    const row = { ...vendor, eligibility };
    if (!eligibility.eligible) {
      skipped.push({ id: row.id, name: row.name, reasons: eligibility.reasons });
      continue;
    }
    if (input.emergency && !row.emergency_available) {
      skipped.push({ id: row.id, name: row.name, reasons: ["Not marked emergency-available"] });
      continue;
    }
    if (!serviceFits(row, input.title)) {
      skipped.push({ id: row.id, name: row.name, reasons: ["Trade does not match this job"] });
      continue;
    }
    const cost = impliedCostCents(row);
    if (input.budgetCents != null && cost != null && cost > input.budgetCents) {
      skipped.push({ id: row.id, name: row.name, reasons: ["Published rate exceeds approved budget"] });
      continue;
    }
    const preferred = (row.eligibility?.signals ?? []).some((signal) => /preferred/i.test(signal))
      || row.approval_status === "preferred"
      || (row.vendor_owner_preferences ?? []).some((pref) => pref.preference === "preferred")
      || (row.vendor_property_preferences ?? []).some((pref) => pref.preference === "preferred");
    let score = 0;
    if (preferred) score += 80;
    if (row.approval_status === "preferred") score += 20;
    if (input.emergency && row.emergency_available) score += 25;
    if (cost != null && input.budgetCents) score += Math.max(0, 30 - (cost / input.budgetCents) * 20);
    score -= Number(row.expected_response_minutes ?? 180) / 20;
    ranked.push({
      vendor: row,
      score: Math.round(score * 100) / 100,
      impliedCostCents: cost,
      reasons: rankingReasons(row, Boolean(input.emergency)),
    });
  }

  ranked.sort((a, b) => b.score - a.score || a.vendor.name.localeCompare(b.vendor.name));
  return { pick: ranked[0] ?? null, skipped };
}
