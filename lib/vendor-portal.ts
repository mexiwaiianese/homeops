import { serviceFits } from "@/lib/auto-assign";

/** Successful completed jobs required before a vendor can bid or autobid across the network. */
export const JOBS_BEFORE_OPEN_BIDDING = 3;

export type NotifyRule = {
  enabled: boolean;
  services: string[];
  minAmountCents: number | null;
  maxAmountCents: number | null;
  minNoticeHours: number;
  emergencyOnly: boolean;
  cities: string[];
  states: string[];
};

export type AutobidDraft = {
  enabled: boolean;
  maxAmountCents: number | null;
  minAmountCents: number | null;
  undercutCents: number;
  minNoticeHours: number;
  jobDurationHours: number;
};

export type BidAccess = {
  allowed: boolean;
  scope: "network" | "manager" | "locked";
  reason: string | null;
  managers: string[];
  successfulJobs: number;
  jobsRequired: number;
};

export function defaultNotifyRule(vendor?: { services?: string[]; trade?: string | null }): NotifyRule {
  const services = (vendor?.services ?? []).map((row) => row.trim()).filter(Boolean);
  return {
    enabled: true,
    services: services.length ? services : vendor?.trade ? [vendor.trade] : [],
    minAmountCents: null,
    maxAmountCents: null,
    minNoticeHours: 4,
    emergencyOnly: false,
    cities: [],
    states: [],
  };
}

export function biddingAccess(input: {
  successfulJobs: number;
  grants: Array<{ homeIds: string[]; managerName: string }>;
  homeId: string;
}): BidAccess {
  const jobsRequired = JOBS_BEFORE_OPEN_BIDDING;
  const base = { successfulJobs: input.successfulJobs, jobsRequired };
  if (input.successfulJobs >= jobsRequired) {
    return { ...base, allowed: true, scope: "network", reason: null, managers: [] };
  }
  const hits = input.grants.filter((grant) => input.homeId && grant.homeIds.includes(input.homeId));
  if (hits.length) {
    return {
      ...base,
      allowed: true,
      scope: "manager",
      reason: null,
      managers: [...new Set(hits.map((grant) => grant.managerName))],
    };
  }
  const remaining = Math.max(1, jobsRequired - input.successfulJobs);
  return {
    ...base,
    allowed: false,
    scope: "locked",
    reason: `Bidding and autobid are locked until this company completes ${remaining} more successful job${remaining === 1 ? "" : "s"} (${input.successfulJobs} of ${jobsRequired} on record), or a property manager allows them onto that manager's properties. An early allowance only covers that manager's property set.`,
    managers: [],
  };
}

export function accessSummary(access: Pick<BidAccess, "scope" | "successfulJobs" | "jobsRequired" | "managers" | "reason">) {
  if (access.scope === "network") {
    return `${access.successfulJobs} successful jobs are on record, so bidding and autobid can run on any matching opportunity.`;
  }
  if (access.scope === "manager") {
    const names = access.managers.join(", ") || "the property manager";
    return `Early access is on for ${names}'s properties only. Network-wide bidding unlocks at ${access.jobsRequired} successful jobs (${access.successfulJobs} on record).`;
  }
  return access.reason || "Bidding is locked.";
}

export type OpportunityMatch = {
  title: string;
  vendorServices: string[];
  vendorTrade?: string | null;
  budgetCents: number | null;
  neededBy?: string | null;
  city?: string | null;
  state?: string | null;
  emergency: boolean;
  vendorEmergency?: boolean | null;
};

export function notificationBlockReason(rule: NotifyRule, opportunity: OpportunityMatch): string | null {
  if (!rule.enabled) return "Bid notifications are turned off";
  const catalog = rule.services.length
    ? rule.services
    : [opportunity.vendorTrade, ...opportunity.vendorServices].filter((row): row is string => Boolean(row));
  if (!catalog.length || !serviceFits({ id: "match", name: "match", trade: catalog.join(" "), services: catalog }, opportunity.title)) {
    return "This job is outside the trades you accept notifications for";
  }
  if (opportunity.emergency && opportunity.vendorEmergency === false) {
    return "Emergency jobs stay off your list until the company is marked emergency-available";
  }
  if (rule.emergencyOnly && !opportunity.emergency) return "You only accept notifications for emergency work";
  if (opportunity.budgetCents != null && rule.minAmountCents != null && opportunity.budgetCents < rule.minAmountCents) {
    return "The published budget is below your notification minimum";
  }
  if (opportunity.budgetCents != null && rule.maxAmountCents != null && opportunity.budgetCents > rule.maxAmountCents) {
    return "The published budget is above your notification maximum";
  }
  if (rule.minNoticeHours > 0 && opportunity.neededBy) {
    const noticeMs = rule.minNoticeHours * 60 * 60 * 1000;
    if (new Date(opportunity.neededBy).getTime() - Date.now() < noticeMs) {
      return "The needed-by time is inside your notification notice window";
    }
  }
  const state = (opportunity.state || "").trim().toLowerCase();
  if (rule.states.length && state && !rule.states.some((row) => row.trim().toLowerCase() === state)) {
    return "This job is outside the states you want notified about";
  }
  const city = (opportunity.city || "").split(",")[0].trim().toLowerCase();
  if (rule.cities.length && city && !rule.cities.some((row) => city.includes(row.trim().toLowerCase()))) {
    return "This job is outside the cities you want notified about";
  }
  return null;
}

export function dollarsToCents(value: unknown): number | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function textList(value: unknown, fallback: string[]) {
  if (typeof value === "string") return value.split(",").map((row) => row.trim()).filter(Boolean);
  if (Array.isArray(value)) return value.map((row) => String(row).trim()).filter(Boolean);
  return fallback;
}

export function normalizeNotifyInput(body: any, fallback: NotifyRule): { rule: NotifyRule; error?: string } {
  const rule: NotifyRule = {
    enabled: body?.enabled !== false,
    services: Array.isArray(body?.services) ? body.services.map((row: unknown) => String(row).trim()).filter(Boolean) : fallback.services,
    minAmountCents: body?.minAmount === undefined ? fallback.minAmountCents : dollarsToCents(body?.minAmount),
    maxAmountCents: body?.maxAmount === undefined ? fallback.maxAmountCents : dollarsToCents(body?.maxAmount),
    minNoticeHours: body?.minNoticeHours == null || body?.minNoticeHours === "" ? fallback.minNoticeHours : Math.max(0, Number(body.minNoticeHours) || 0),
    emergencyOnly: Boolean(body?.emergencyOnly),
    cities: textList(body?.cities, fallback.cities),
    states: textList(body?.states, fallback.states),
  };
  if (rule.enabled && !rule.services.length) return { rule, error: "Choose at least one trade to be notified about." };
  if (rule.minAmountCents != null && rule.maxAmountCents != null && rule.minAmountCents > rule.maxAmountCents) {
    return { rule, error: "Notification minimum cannot be above the maximum." };
  }
  return { rule };
}

export function normalizeAutobidInput(body: any, fallback: AutobidDraft): { rule: AutobidDraft; error?: string } {
  const rule: AutobidDraft = {
    enabled: body?.enabled === true,
    maxAmountCents: body?.maxAmount === undefined ? fallback.maxAmountCents : dollarsToCents(body?.maxAmount),
    minAmountCents: body?.minAmount === undefined ? fallback.minAmountCents : dollarsToCents(body?.minAmount),
    undercutCents: body?.undercut === undefined ? fallback.undercutCents : Math.max(100, dollarsToCents(body?.undercut) || 100),
    minNoticeHours: body?.minNoticeHours == null || body?.minNoticeHours === "" ? fallback.minNoticeHours : Math.max(0, Number(body.minNoticeHours) || 0),
    jobDurationHours: body?.jobDurationHours == null || body?.jobDurationHours === "" ? fallback.jobDurationHours : Math.max(1, Number(body.jobDurationHours) || 1),
  };
  if (!rule.enabled) return { rule };
  if (rule.maxAmountCents == null) return { rule, error: "Set a maximum bid before turning autobid on. Autobid will not run without a ceiling." };
  if (rule.minAmountCents == null) return { rule, error: "Set a floor bid before turning autobid on. Autobid will not run without a floor." };
  if (rule.minAmountCents > rule.maxAmountCents) return { rule, error: "Autobid floor cannot be above the ceiling." };
  if (rule.undercutCents < 100) return { rule, error: "Undercut must be at least $1." };
  return { rule };
}
