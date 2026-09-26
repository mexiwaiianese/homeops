import { homes } from "@/lib/data";
import { vendors as demoVendors } from "@/lib/vendor-demo";
import {
  accessSummary,
  biddingAccess,
  defaultNotifyRule,
  notificationBlockReason,
  type BidAccess,
  type NotifyRule,
  type OpportunityMatch,
} from "@/lib/vendor-portal";

export type DemoGrant = {
  id: string;
  vendorId: string;
  managerId: string;
  managerName: string;
  homeIds: string[];
  grantedAt: string;
};

export type CrewMember = {
  id: string;
  vendorId: string;
  name: string;
  email: string;
  phone: string;
  token: string;
  jobTokens: string[];
};

export type ReceivableStatus = "upcoming" | "invoiced" | "paid" | "overdue";

export type Receivable = {
  id: string;
  vendorId: string;
  title: string;
  propertyLabel: string;
  amountCents: number;
  status: ReceivableStatus;
  dueOn: string;
  note: string;
};

export type PayoutAccount = {
  vendorId: string;
  bankName: string | null;
  last4: string | null;
  status: "missing" | "pending" | "confirmed";
  confirmedAt: string | null;
  stripeCustomerId: string | null;
  stripePaymentMethodId: string | null;
};

export const DEMO_MANAGER = { id: "pm-demo", name: "Demo Property Manager" };

type PortalStore = {
  notify: Map<string, NotifyRule>;
  grants: Map<string, DemoGrant>;
  extraJobs: Map<string, number>;
  countedJobs: Set<string>;
  crew: Map<string, CrewMember>;
  receivables: Receivable[];
  payouts: Map<string, PayoutAccount>;
};

function dayStamp(offsetDays: number) {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function seedNotify() {
  return new Map(demoVendors.map((vendor) => [vendor.id, defaultNotifyRule(vendor)]));
}

function seedCrew(): Map<string, CrewMember> {
  return new Map([
    ["crew-v1", { id: "crew-v1", vendorId: "v1", name: "Alex Rivera", email: "alex@demoheating.example", phone: "(385) 555-0191", token: "crew-demo-heating", jobTokens: ["job-demo-heating-m1"] }],
    ["crew-v2", { id: "crew-v2", vendorId: "v2", name: "Jordan Lee", email: "jordan@demoplumbing.example", phone: "(801) 555-0192", token: "crew-demo-plumbing", jobTokens: [] }],
    ["crew-v3", { id: "crew-v3", vendorId: "v3", name: "Sam Patel", email: "sam@demohomeservices.example", phone: "(801) 555-0193", token: "crew-demo-homeservices", jobTokens: [] }],
  ]);
}

function seedReceivables(): Receivable[] {
  return [
    { id: "ar-v1-paid", vendorId: "v1", title: "Furnace service", propertyLabel: "100 Demo Lane", amountCents: 18900, status: "paid", dueOn: dayStamp(-20), note: "Collected from the property manager. Nothing left to invoice on this visit." },
    { id: "ar-v1-invoiced", vendorId: "v1", title: "Capacitor replacement", propertyLabel: "200 Sample Avenue", amountCents: 24000, status: "invoiced", dueOn: dayStamp(6), note: "Invoice is with the property manager. You can collect on the due date." },
    { id: "ar-v1-upcoming", vendorId: "v1", title: "No heat — awarded, not invoiced", propertyLabel: "100 Demo Lane", amountCents: 18900, status: "upcoming", dueOn: dayStamp(14), note: "Awarded work. Invoice after the crew closes the visit. Not collectible until the job is documented." },
    { id: "ar-v2-paid", vendorId: "v2", title: "Supply line repair", propertyLabel: "400 Preview Road", amountCents: 16500, status: "paid", dueOn: dayStamp(-12), note: "Paid in full." },
    { id: "ar-v2-overdue", vendorId: "v2", title: "Angle stop replacement", propertyLabel: "300 Example Court", amountCents: 21000, status: "overdue", dueOn: dayStamp(-4), note: "Past due. Follow up with the property manager before sending another crew." },
    { id: "ar-v2-invoiced", vendorId: "v2", title: "Drain cleaning", propertyLabel: "100 Demo Lane", amountCents: 18500, status: "invoiced", dueOn: dayStamp(9), note: "Invoice sent. Collectible on the due date." },
    { id: "ar-v3-paid", vendorId: "v3", title: "Drywall patch", propertyLabel: "200 Sample Avenue", amountCents: 27500, status: "paid", dueOn: dayStamp(-30), note: "Collected." },
    { id: "ar-v3-upcoming", vendorId: "v3", title: "Door latch adjustment", propertyLabel: "400 Preview Road", amountCents: 9500, status: "upcoming", dueOn: dayStamp(10), note: "Approved amount waiting on job close-out before you can invoice." },
  ];
}

function seedPayouts(): Map<string, PayoutAccount> {
  return new Map([
    ["v1", { vendorId: "v1", bankName: "Demo Federal Credit Union", last4: "4421", status: "confirmed", confirmedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(), stripeCustomerId: null, stripePaymentMethodId: null }],
    ["v2", { vendorId: "v2", bankName: "Example Bank", last4: "1180", status: "pending", confirmedAt: null, stripeCustomerId: null, stripePaymentMethodId: null }],
    ["v3", { vendorId: "v3", bankName: null, last4: null, status: "missing", confirmedAt: null, stripeCustomerId: null, stripePaymentMethodId: null }],
  ]);
}

function emptyStore(): PortalStore {
  return {
    notify: seedNotify(),
    grants: new Map(),
    extraJobs: new Map(),
    countedJobs: new Set(),
    crew: seedCrew(),
    receivables: seedReceivables(),
    payouts: seedPayouts(),
  };
}

const store: PortalStore =
  ((globalThis as typeof globalThis & { __homeopsVendorPortal?: PortalStore }).__homeopsVendorPortal ??= emptyStore());

export function resetDemoPortal() {
  const next = emptyStore();
  store.notify = next.notify;
  store.grants = next.grants;
  store.extraJobs = next.extraJobs;
  store.countedJobs = next.countedJobs;
  store.crew = next.crew;
  store.receivables = next.receivables;
  store.payouts = next.payouts;
}

export function demoSuccessfulJobs(vendorId: string) {
  const vendor = demoVendors.find((row) => row.id === vendorId);
  return (vendor?.performance.jobs ?? 0) + (store.extraJobs.get(vendorId) ?? 0);
}

export function recordDemoSuccessfulJob(vendorId: string, jobId: string) {
  if (!vendorId || store.countedJobs.has(jobId)) return demoSuccessfulJobs(vendorId);
  store.countedJobs.add(jobId);
  store.extraJobs.set(vendorId, (store.extraJobs.get(vendorId) ?? 0) + 1);
  return demoSuccessfulJobs(vendorId);
}

export function getDemoNotify(vendorId: string): NotifyRule {
  return store.notify.get(vendorId) || defaultNotifyRule(demoVendors.find((row) => row.id === vendorId));
}

export function setDemoNotify(vendorId: string, rule: NotifyRule) {
  store.notify.set(vendorId, rule);
  return rule;
}

export function getDemoGrants(vendorId: string) {
  return [...store.grants.values()].filter((row) => row.vendorId === vendorId);
}

export function demoManagerHomes() {
  return homes.map((home) => ({ id: home.id, address: home.address, city: home.city }));
}

export function grantDemoBidding(vendorId: string) {
  const grant: DemoGrant = {
    id: `grant-${vendorId}-${DEMO_MANAGER.id}`,
    vendorId,
    managerId: DEMO_MANAGER.id,
    managerName: DEMO_MANAGER.name,
    homeIds: homes.map((home) => home.id),
    grantedAt: new Date().toISOString(),
  };
  store.grants.set(grant.id, grant);
  return grant;
}

export function revokeDemoBidding(vendorId: string) {
  for (const grant of getDemoGrants(vendorId)) store.grants.delete(grant.id);
}

export function demoBidAccess(vendorId: string, homeId: string): BidAccess {
  return biddingAccess({
    successfulJobs: demoSuccessfulJobs(vendorId),
    grants: getDemoGrants(vendorId),
    homeId,
  });
}

export function demoOpportunityGate(vendorId: string, opportunity: OpportunityMatch & { homeId?: string | null }) {
  const vendor = demoVendors.find((row) => row.id === vendorId);
  const access = demoBidAccess(vendorId, opportunity.homeId || "");
  const notificationReason = notificationBlockReason(getDemoNotify(vendorId), {
    ...opportunity,
    vendorServices: vendor?.services ?? [],
    vendorTrade: vendor?.trade,
    vendorEmergency: vendor?.emergency_available,
  });
  const bidBlocked = !access.allowed ? access.reason : notificationReason;
  return { access, notificationReason, bidBlocked, summary: accessSummary(access) };
}

export function listDemoCrew(vendorId: string) {
  return [...store.crew.values()].filter((row) => row.vendorId === vendorId);
}

export function getDemoCrewByToken(token: string) {
  return [...store.crew.values()].find((row) => row.token === token) || null;
}

export function addDemoCrew(vendorId: string, input: { name?: string; email: string; phone: string }) {
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address.", status: 400 as const };
  if (phone.replace(/\D/g, "").length < 10) return { error: "Enter a cell phone number with at least 10 digits.", status: 400 as const };
  if (listDemoCrew(vendorId).some((row) => row.email === email)) return { error: "That email is already on the crew.", status: 409 as const };
  const id = `crew-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const member: CrewMember = {
    id,
    vendorId,
    name: (input.name || email.split("@")[0]).trim(),
    email,
    phone,
    token: `crew-${id}`,
    jobTokens: [],
  };
  store.crew.set(id, member);
  return { member };
}

export function assignDemoCrew(vendorId: string, crewId: string, jobToken: string, assign: boolean) {
  const member = store.crew.get(crewId);
  if (!member || member.vendorId !== vendorId) return { error: "Crew member not found.", status: 404 as const };
  const tokens = new Set(member.jobTokens);
  if (assign) tokens.add(jobToken);
  else tokens.delete(jobToken);
  member.jobTokens = [...tokens];
  return { member };
}

export function listDemoReceivables(vendorId: string) {
  return store.receivables.filter((row) => row.vendorId === vendorId);
}

export function receivableTotals(rows: Receivable[]) {
  const sum = (status: ReceivableStatus) => rows.filter((row) => row.status === status).reduce((total, row) => total + row.amountCents, 0);
  return {
    upcomingCents: sum("upcoming"),
    invoicedCents: sum("invoiced"),
    overdueCents: sum("overdue"),
    paidCents: sum("paid"),
  };
}

export function getDemoPayout(vendorId: string): PayoutAccount {
  return store.payouts.get(vendorId) || {
    vendorId,
    bankName: null,
    last4: null,
    status: "missing",
    confirmedAt: null,
    stripeCustomerId: null,
    stripePaymentMethodId: null,
  };
}

export function setDemoPayout(vendorId: string, patch: Partial<PayoutAccount>) {
  const next = { ...getDemoPayout(vendorId), ...patch, vendorId };
  store.payouts.set(vendorId, next);
  return next;
}
