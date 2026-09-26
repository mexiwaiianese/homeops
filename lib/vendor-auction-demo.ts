import { homes } from "@/lib/data";
import { getDemoMaintenance, listDemoMaintenance } from "@/lib/maintenance-demo";
import { serviceFits } from "@/lib/auto-assign";
import { explainVendorEligibility } from "@/lib/vendors";
import { autobidBlockReason, leadingBid, nextAutobidAmount, notifyAuctionInvite, type AuctionBid, type AutobidRule } from "@/lib/vendor-auction";
import { vendors as demoVendors } from "@/lib/vendor-demo";
import { demoOpportunityGate } from "@/lib/vendor-portal-demo";
import type { CalendarConnection } from "@/lib/vendor-calendar";

type DemoInvite = {
  id: string;
  vendorId: string;
  vendorName: string;
  token: string;
  status: "invited" | "viewed" | "bid" | "declined" | "skipped";
  channel: "email" | "sms" | null;
  sentTo: string | null;
  bidUrl: string;
  notifiedAt: string;
  viewedAt?: string | null;
  deliveryError?: string | null;
};

type DemoOpportunity = {
  id: string;
  maintenanceRequestId: string;
  homeId: string;
  title: string;
  description: string;
  city: string;
  state: string;
  postalCode: string;
  address1: string;
  budgetCents: number | null;
  neededBy: string;
  priority: string;
  startsAt: string;
  endsAt: string;
  status: "open" | "awarded" | "cancelled" | "expired";
  awardedVendorId?: string | null;
  invites: DemoInvite[];
  bids: AuctionBid[];
};

const SEED_REVISION = 2;

type DemoStore = {
  opportunities: Map<string, DemoOpportunity>;
  calendars: Map<string, CalendarConnection>;
  autobid: Map<string, AutobidRule>;
  revision?: number;
};

function defaultCalendars(): Map<string, CalendarConnection> {
  return new Map([
    ["v1", { provider: "demo", status: "connected", connected_at: new Date().toISOString(), metadata: { busyBlocks: [] } }],
    ["v2", { provider: "demo", status: "connected", connected_at: new Date().toISOString(), metadata: { busyBlocks: [] } }],
    ["v3", { provider: "demo", status: "disconnected", metadata: { busyBlocks: [] } }],
  ]);
}

function defaultAutobid(): Map<string, AutobidRule> {
  return new Map([
    ["v1", { enabled: true, maxAmountCents: 42000, minAmountCents: 12000, undercutCents: 1500, minNoticeHours: 2, jobDurationHours: 2 }],
    ["v2", { enabled: true, maxAmountCents: 90000, minAmountCents: 18000, undercutCents: 2500, minNoticeHours: 4, jobDurationHours: 3 }],
    ["v3", { enabled: true, maxAmountCents: 24000, minAmountCents: 9000, undercutCents: 1000, minNoticeHours: 4, jobDurationHours: 2 }],
  ]);
}

const store: DemoStore =
  ((globalThis as typeof globalThis & { __homeopsAuctions?: DemoStore }).__homeopsAuctions ??= {
    opportunities: new Map(),
    calendars: defaultCalendars(),
    autobid: defaultAutobid(),
  });

/** Drop every auction and put vendor calendars and autobid rules back to their demo defaults. */
export function resetDemoAuctions() {
  store.opportunities.clear();
  store.calendars = defaultCalendars();
  store.autobid = defaultAutobid();
}

function token() {
  return `bid-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function getDemoCalendar(vendorId: string) {
  return store.calendars.get(vendorId) || { provider: "demo", status: "disconnected", metadata: { busyBlocks: [] } };
}

export function setDemoCalendar(vendorId: string, connection: CalendarConnection) {
  store.calendars.set(vendorId, connection);
  return getDemoCalendar(vendorId);
}

export function getDemoAutobid(vendorId: string): AutobidRule {
  return store.autobid.get(vendorId) || {
    enabled: false,
    maxAmountCents: null,
    minAmountCents: null,
    undercutCents: 2500,
    minNoticeHours: 4,
    jobDurationHours: 2,
  };
}

export function setDemoAutobid(vendorId: string, rule: Partial<AutobidRule>) {
  const current = getDemoAutobid(vendorId);
  const next = { ...current, ...rule };
  store.autobid.set(vendorId, next);
  return next;
}

export function findDemoInvite(tokenValue: string) {
  for (const opportunity of store.opportunities.values()) {
    const invite = opportunity.invites.find((row) => row.token === tokenValue);
    if (invite) return { opportunity, invite };
  }
  return null;
}

export function getDemoOpportunityByJob(jobId: string) {
  return [...store.opportunities.values()].find((row) => row.maintenanceRequestId === jobId) || null;
}

function vendorContact(vendorId: string) {
  const vendor = demoVendors.find((row) => row.id === vendorId);
  return { email: vendor?.email || null, phone: vendor?.phone || null, name: vendor?.name || "Vendor" };
}

function opportunityMatch(opportunity: DemoOpportunity) {
  return {
    homeId: opportunity.homeId,
    title: opportunity.title,
    budgetCents: opportunity.budgetCents,
    neededBy: opportunity.neededBy,
    city: opportunity.city,
    state: opportunity.state,
    emergency: opportunity.priority === "Emergency",
    vendorServices: [] as string[],
  };
}

function runAutobid(opportunity: DemoOpportunity) {
  for (const invite of opportunity.invites) {
    if (invite.status === "skipped" || invite.status === "declined") continue;
    const vendor = demoVendors.find((row) => row.id === invite.vendorId);
    if (!vendor) continue;
    const rule = getDemoAutobid(vendor.id);
    const calendar = getDemoCalendar(vendor.id);
    const gate = demoOpportunityGate(vendor.id, opportunityMatch(opportunity));
    const blocked = autobidBlockReason({
      rule,
      calendar,
      neededBy: opportunity.neededBy,
      accessReason: gate.access.allowed ? null : gate.access.reason,
      notificationReason: gate.notificationReason,
    });
    if (blocked) continue;
    const lead = leadingBid(opportunity.bids);
    const amount = nextAutobidAmount({
      rule,
      leadingCents: lead && lead.vendorId !== vendor.id ? lead.amountCents : null,
      budgetCents: opportunity.budgetCents,
    });
    if (amount == null) continue;
    const existing = opportunity.bids.find((bid) => bid.vendorId === vendor.id && bid.status === "active");
    if (existing && existing.amountCents <= amount) continue;
    const bid: AuctionBid = {
      id: existing?.id || `bid-${vendor.id}-${opportunity.id}`,
      vendorId: vendor.id,
      vendorName: vendor.name,
      amountCents: amount,
      source: "autobid",
      status: "active",
      proposedStart: opportunity.neededBy,
      notes: "Autobid placed after calendar confirmed an open slot.",
      submittedAt: new Date().toISOString(),
    };
    opportunity.bids = [...opportunity.bids.filter((row) => row.vendorId !== vendor.id), bid];
    invite.status = "bid";
    if (!invite.viewedAt) invite.viewedAt = bid.submittedAt;
  }
}

async function inviteVendor(opportunity: DemoOpportunity, vendorId: string, origin: string) {
  const vendor = demoVendors.find((row) => row.id === vendorId);
  if (!vendor) return;
  const existing = opportunity.invites.find((row) => row.vendorId === vendorId);
  const gate = demoOpportunityGate(vendorId, opportunityMatch(opportunity));
  if (gate.notificationReason) {
    if (existing && existing.status === "invited") existing.status = "skipped";
    return;
  }
  if (existing && existing.status !== "skipped") return;
  const contact = vendorContact(vendorId);
  const inviteToken = existing?.token || token();
  const url = `${origin.replace(/\/$/, "")}/vendors/bid/${inviteToken}`;
  const delivery = await notifyAuctionInvite({
    email: contact.email,
    phone: contact.phone,
    organizationName: "HomeOps Demo Management",
    vendorName: vendor.name,
    title: opportunity.title,
    url,
    budgetCents: opportunity.budgetCents,
    neededBy: opportunity.neededBy,
  });
  const invite: DemoInvite = {
    id: existing?.id || `inv-${vendorId}-${opportunity.id}`,
    vendorId,
    vendorName: vendor.name,
    token: inviteToken,
    status: "invited",
    channel: delivery.channel,
    sentTo: delivery.sentTo,
    bidUrl: url,
    notifiedAt: new Date().toISOString(),
    viewedAt: existing?.viewedAt || null,
    deliveryError: delivery.sent ? null : delivery.error || "Link generated; email/SMS not configured",
  };
  opportunity.invites = [...opportunity.invites.filter((row) => row.vendorId !== vendorId), invite];
}

function eligibleVendorIds(title: string) {
  return demoVendors
    .filter((vendor) => explainVendorEligibility(vendor).eligible && serviceFits(vendor, title))
    .map((vendor) => vendor.id);
}

export async function openDemoAuction(input: {
  jobId: string;
  budgetCents: number | null;
  neededBy?: string | null;
  origin: string;
}) {
  const job = getDemoMaintenance(input.jobId);
  if (!job) throw new Error("Request not found");
  const existing = getDemoOpportunityByJob(input.jobId);
  if (existing && existing.status === "open") {
    if (!existing.homeId) existing.homeId = job.homeId;
    if (!existing.priority) existing.priority = job.priority;
    return { opportunity: existing, created: false };
  }
  const home = homes.find((row) => row.id === job.homeId);
  const neededBy = input.neededBy || new Date(Date.now() + (job.priority === "Emergency" ? 8 : 48) * 60 * 60 * 1000).toISOString();
  const opportunity: DemoOpportunity = {
    id: `opp-${input.jobId}`,
    maintenanceRequestId: input.jobId,
    homeId: job.homeId,
    title: job.title,
    description: job.note,
    city: home?.city.split(",")[0] || "Lehi",
    state: "UT",
    postalCode: "84043",
    address1: home?.address || "",
    budgetCents: input.budgetCents,
    neededBy,
    priority: job.priority,
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: "open",
    invites: [],
    bids: [],
  };
  for (const vendorId of eligibleVendorIds(job.title)) {
    await inviteVendor(opportunity, vendorId, input.origin);
  }
  runAutobid(opportunity);
  store.opportunities.set(opportunity.id, opportunity);
  return { opportunity, created: true };
}

/** Re-check open auctions after a vendor changes notification rules, and invite anyone who now matches. */
export async function syncDemoInvites(origin: string) {
  for (const opportunity of store.opportunities.values()) {
    if (opportunity.status !== "open") continue;
    for (const vendorId of eligibleVendorIds(opportunity.title)) {
      await inviteVendor(opportunity, vendorId, origin);
    }
    runAutobid(opportunity);
  }
}

/** Property-manager board seed: open a reverse auction for every unassigned job sitting in Authorize. */
export async function seedManagerOpportunities(origin: string) {
  if (store.revision !== SEED_REVISION) {
    store.opportunities.clear();
    store.revision = SEED_REVISION;
  }
  const jobs = listDemoMaintenance().filter((job) => !job.vendorId && job.status === "Authorize");
  const created: string[] = [];
  for (const job of jobs) {
    const opened = await openDemoAuction({
      jobId: job.id,
      budgetCents: job.estimate ? Math.round(job.estimate * 100) : null,
      origin,
    });
    if (opened.created) created.push(job.id);
  }
  return {
    created,
    openJobIds: [...store.opportunities.values()].filter((row) => row.status === "open").map((row) => row.maintenanceRequestId),
  };
}

export function listDemoOpportunitiesForVendor(vendorId: string) {
  return [...store.opportunities.values()]
    .filter((opportunity) => opportunity.status === "open" || opportunity.awardedVendorId === vendorId)
    .map((opportunity) => {
      const invite = opportunity.invites.find((row) => row.vendorId === vendorId && row.status !== "skipped" && row.status !== "declined");
      const gate = demoOpportunityGate(vendorId, opportunityMatch(opportunity));
      const ownBid = opportunity.bids.find((bid) => bid.vendorId === vendorId && bid.status !== "withdrawn") || null;
      if (!invite && !ownBid) return null;
      if (gate.notificationReason && !ownBid) return null;
      return {
        id: opportunity.id,
        maintenanceRequestId: opportunity.maintenanceRequestId,
        title: opportunity.title,
        address: opportunity.address1,
        city: opportunity.city,
        state: opportunity.state,
        budgetCents: opportunity.budgetCents,
        neededBy: opportunity.neededBy,
        status: opportunity.status,
        bidUrl: invite?.bidUrl || null,
        ownBidCents: ownBid?.amountCents ?? null,
        ownBidSource: ownBid?.source ?? null,
        leadingCents: leadingBid(opportunity.bids)?.amountCents ?? null,
        bidBlocked: ownBid ? null : gate.bidBlocked,
        accessScope: gate.access.scope,
        accessSummary: gate.summary,
        autobidBlocked: (() => {
          const rule = getDemoAutobid(vendorId);
          const blocked = autobidBlockReason({
            rule,
            calendar: getDemoCalendar(vendorId),
            neededBy: opportunity.neededBy,
            accessReason: gate.access.allowed ? null : gate.access.reason,
            notificationReason: gate.notificationReason,
          });
          if (blocked || !rule.enabled || ownBid) return blocked;
          const lead = leadingBid(opportunity.bids);
          const amount = nextAutobidAmount({
            rule,
            leadingCents: lead && lead.vendorId !== vendorId ? lead.amountCents : null,
            budgetCents: opportunity.budgetCents,
          });
          return amount == null ? "No autobid fits inside your floor, ceiling, and undercut for this budget." : null;
        })(),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function placeDemoBid(tokenValue: string, input: { amountCents: number; notes?: string; proposedStart?: string | null }) {
  const found = findDemoInvite(tokenValue);
  if (!found) return { error: "This bid link is invalid.", status: 404 as const };
  const { opportunity, invite } = found;
  if (opportunity.status !== "open") return { error: "This auction is closed.", status: 409 as const };
  if (new Date(opportunity.endsAt) < new Date()) return { error: "This auction has ended.", status: 410 as const };
  const gate = demoOpportunityGate(invite.vendorId, opportunityMatch(opportunity));
  if (gate.bidBlocked) return { error: gate.bidBlocked, status: 403 as const };
  const vendor = demoVendors.find((row) => row.id === invite.vendorId);
  const bid: AuctionBid = {
    id: `bid-${invite.vendorId}-${opportunity.id}`,
    vendorId: invite.vendorId,
    vendorName: vendor?.name,
    amountCents: input.amountCents,
    source: "manual",
    status: "active",
    proposedStart: input.proposedStart || opportunity.neededBy,
    notes: input.notes || null,
    submittedAt: new Date().toISOString(),
  };
  opportunity.bids = [...opportunity.bids.filter((row) => row.vendorId !== invite.vendorId), bid];
  invite.status = "bid";
  if (!invite.viewedAt) invite.viewedAt = bid.submittedAt;
  runAutobid(opportunity);
  return { opportunity, invite, bid };
}

export function awardDemoBid(jobId: string, vendorId: string) {
  const opportunity = getDemoOpportunityByJob(jobId);
  if (!opportunity || opportunity.status !== "open") return { error: "No open auction", status: 409 as const };
  const bid = opportunity.bids.find((row) => row.vendorId === vendorId && row.status === "active");
  if (!bid) return { error: "Bid not found", status: 404 as const };
  opportunity.status = "awarded";
  opportunity.awardedVendorId = vendorId;
  opportunity.bids = opportunity.bids.map((row) => ({
    ...row,
    status: row.vendorId === vendorId ? "awarded" : row.status === "active" ? "lost" : row.status,
  }));
  return { opportunity, bid };
}

export function cancelDemoAuction(jobId: string) {
  const opportunity = getDemoOpportunityByJob(jobId);
  if (!opportunity || opportunity.status !== "open") return { error: "No open auction", status: 409 as const };
  opportunity.status = "cancelled";
  return { opportunity };
}

export function markDemoInviteViewed(tokenValue: string) {
  const found = findDemoInvite(tokenValue);
  if (!found) return null;
  if (found.invite.status === "invited") {
    found.invite.status = "viewed";
    found.invite.viewedAt = new Date().toISOString();
  }
  return found;
}
