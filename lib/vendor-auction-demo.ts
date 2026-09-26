import { homes } from "@/lib/data";
import { getDemoMaintenance } from "@/lib/maintenance-demo";
import { serviceFits } from "@/lib/auto-assign";
import { explainVendorEligibility } from "@/lib/vendors";
import { autobidBlockReason, leadingBid, nextAutobidAmount, notifyAuctionInvite, type AuctionBid, type AutobidRule } from "@/lib/vendor-auction";
import { vendors as demoVendors } from "@/lib/vendor-demo";
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
  title: string;
  description: string;
  city: string;
  state: string;
  postalCode: string;
  address1: string;
  budgetCents: number | null;
  neededBy: string;
  startsAt: string;
  endsAt: string;
  status: "open" | "awarded" | "cancelled" | "expired";
  awardedVendorId?: string | null;
  invites: DemoInvite[];
  bids: AuctionBid[];
};

type DemoStore = {
  opportunities: Map<string, DemoOpportunity>;
  calendars: Map<string, CalendarConnection>;
  autobid: Map<string, AutobidRule>;
};

const store: DemoStore =
  ((globalThis as typeof globalThis & { __homeopsAuctions?: DemoStore }).__homeopsAuctions ??= {
    opportunities: new Map(),
    calendars: new Map([
      ["v1", { provider: "demo", status: "connected", connected_at: new Date().toISOString(), metadata: { busyBlocks: [] } }],
      ["v2", { provider: "demo", status: "connected", connected_at: new Date().toISOString(), metadata: { busyBlocks: [] } }],
      ["v3", { provider: "demo", status: "disconnected", metadata: { busyBlocks: [] } }],
    ]),
    autobid: new Map([
      ["v1", { enabled: true, maxAmountCents: 42000, minAmountCents: 12000, undercutCents: 1500, minNoticeHours: 2, jobDurationHours: 2 }],
      ["v2", { enabled: true, maxAmountCents: 90000, minAmountCents: 18000, undercutCents: 2500, minNoticeHours: 4, jobDurationHours: 3 }],
      ["v3", { enabled: true, maxAmountCents: 24000, minAmountCents: 9000, undercutCents: 1000, minNoticeHours: 4, jobDurationHours: 2 }],
    ]),
  });

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

function runAutobid(opportunity: DemoOpportunity) {
  for (const invite of opportunity.invites) {
    const vendor = demoVendors.find((row) => row.id === invite.vendorId);
    if (!vendor) continue;
    const rule = getDemoAutobid(vendor.id);
    const calendar = getDemoCalendar(vendor.id);
    const blocked = autobidBlockReason({ rule, calendar, neededBy: opportunity.neededBy });
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

export async function openDemoAuction(input: {
  jobId: string;
  budgetCents: number | null;
  neededBy?: string | null;
  origin: string;
}) {
  const existing = getDemoOpportunityByJob(input.jobId);
  if (existing && existing.status === "open") return { opportunity: existing, created: false };
  const job = getDemoMaintenance(input.jobId);
  if (!job) throw new Error("Request not found");
  const home = homes.find((row) => row.id === job.homeId);
  const neededBy = input.neededBy || new Date(Date.now() + (job.priority === "Emergency" ? 8 : 48) * 60 * 60 * 1000).toISOString();
  const eligible = demoVendors.filter((vendor) => {
    const result = explainVendorEligibility(vendor);
    return result.eligible && serviceFits(vendor, job.title);
  });
  const opportunity: DemoOpportunity = {
    id: `opp-${input.jobId}`,
    maintenanceRequestId: input.jobId,
    title: job.title,
    description: job.note,
    city: home?.city.split(",")[0] || "Lehi",
    state: "UT",
    postalCode: "84043",
    address1: home?.address || "",
    budgetCents: input.budgetCents,
    neededBy,
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    status: "open",
    invites: [],
    bids: [],
  };
  for (const vendor of eligible) {
    const contact = vendorContact(vendor.id);
    const inviteToken = token();
    const url = `${input.origin.replace(/\/$/, "")}/vendors/bid/${inviteToken}`;
    const delivery = await notifyAuctionInvite({
      email: contact.email,
      phone: contact.phone,
      organizationName: "HomeOps Demo Management",
      vendorName: vendor.name,
      title: job.title,
      url,
      budgetCents: input.budgetCents,
      neededBy,
    });
    opportunity.invites.push({
      id: `inv-${vendor.id}`,
      vendorId: vendor.id,
      vendorName: vendor.name,
      token: inviteToken,
      status: "invited",
      channel: delivery.channel,
      sentTo: delivery.sentTo,
      bidUrl: url,
      notifiedAt: new Date().toISOString(),
      viewedAt: null,
      deliveryError: delivery.sent ? null : delivery.error || "Link generated; email/SMS not configured",
    });
  }
  runAutobid(opportunity);
  store.opportunities.set(opportunity.id, opportunity);
  return { opportunity, created: true };
}

export function placeDemoBid(tokenValue: string, input: { amountCents: number; notes?: string; proposedStart?: string | null }) {
  const found = findDemoInvite(tokenValue);
  if (!found) return { error: "This bid link is invalid.", status: 404 as const };
  const { opportunity, invite } = found;
  if (opportunity.status !== "open") return { error: "This auction is closed.", status: 409 as const };
  if (new Date(opportunity.endsAt) < new Date()) return { error: "This auction has ended.", status: 410 as const };
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
