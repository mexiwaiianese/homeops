import { vendors as demoVendors } from "@/lib/vendor-demo";
import { lookupVendorPromo, pricedMonthlyCents, vendorMonthlyCents } from "@/lib/vendor-plans";

export type VendorSubscriber = {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  trade: string;
  payments: boolean;
  promoCode: string | null;
  monthlyCents: number;
  createdAt: string;
};

export type VendorInvoiceLine = { description: string; amountCents: number };

export type VendorInvoice = {
  id: string;
  token: string;
  vendorId: string;
  number: string;
  billToName: string;
  billToEmail: string;
  projectLabel: string;
  /** "bid:<id>" or "job:<id>" when the invoice points at work already on the platform. */
  projectKey: string | null;
  details: string;
  dueOn: string;
  issuedOn: string;
  lines: VendorInvoiceLine[];
  totalCents: number;
  payments: boolean;
  sentAt: string | null;
  deliveryError: string | null;
  status?: "draft" | "sent" | "viewed" | "paid" | "overdue" | "void";
  paidAt?: string | null;
  paidSource?: string | null;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactCity: string;
};

type Store = { subscribers: Map<string, VendorSubscriber>; invoices: VendorInvoice[]; seq: number };

const store: Store = ((globalThis as typeof globalThis & { __homeopsVendorBilling?: Store }).__homeopsVendorBilling ??= {
  subscribers: new Map(),
  invoices: [],
  seq: 1000,
});

function token() {
  return `inv-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function getVendorSubscriber(id: string) {
  return store.subscribers.get(id) || null;
}

export type VendorSignupDraft = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  trade: string;
  payments: boolean;
  promoCode: string | null;
  monthlyCents: number;
};

export type VendorSignupQuote = { error: string; status: 400 } | { draft: VendorSignupDraft };

export function quoteVendorSignup(input: {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  city?: string;
  state?: string;
  trade?: string;
  payments: boolean;
  promoCode?: string | null;
}): VendorSignupQuote {
  const email = input.email.trim().toLowerCase();
  if (!input.companyName.trim()) return { error: "Enter the company name.", status: 400 as const };
  if (!input.contactName.trim()) return { error: "Enter your name.", status: 400 as const };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address.", status: 400 as const };
  if (input.phone.replace(/\D/g, "").length < 10) return { error: "Enter a phone number with at least 10 digits.", status: 400 as const };
  if (!input.trade?.trim()) return { error: "Enter your trade.", status: 400 as const };
  const promoRaw = (input.promoCode || "").trim();
  const promo = promoRaw ? lookupVendorPromo(promoRaw) : null;
  if (promoRaw && !promo) return { error: "That promo code is not active.", status: 400 as const };
  const draft: VendorSignupDraft = {
    companyName: input.companyName.trim(),
    contactName: input.contactName.trim(),
    email,
    phone: input.phone.trim(),
    city: (input.city || "").trim(),
    state: (input.state || "").trim(),
    trade: (input.trade || "").trim(),
    payments: input.payments,
    promoCode: promo?.code || null,
    monthlyCents: pricedMonthlyCents(input.payments, promo),
  };
  return { draft };
}

function subscriberByEmail(email: string) {
  return [...store.subscribers.values()].find((row) => row.email === email) || null;
}

function insertDraft(draft: VendorSignupDraft) {
  const id = `vs-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const subscriber: VendorSubscriber = { id, ...draft, createdAt: new Date().toISOString() };
  store.subscribers.set(id, subscriber);
  return subscriber;
}

export function registerVendorSubscriber(input: Parameters<typeof quoteVendorSignup>[0]): { error: string; status: number } | { subscriber: VendorSubscriber; created: boolean } {
  const quoted = quoteVendorSignup(input);
  if ("error" in quoted) return quoted;
  const existing = subscriberByEmail(quoted.draft.email);
  if (existing) return { subscriber: existing, created: false as const };
  return { subscriber: insertDraft(quoted.draft), created: true as const };
}

/** Paid checkout wins over an earlier unpaid draft for the same email. */
export function upsertVendorSubscriber(input: Parameters<typeof quoteVendorSignup>[0]): { error: string; status: number } | { subscriber: VendorSubscriber; created: boolean } {
  const quoted = quoteVendorSignup(input);
  if ("error" in quoted) return quoted;
  const existing = subscriberByEmail(quoted.draft.email);
  if (existing) {
    Object.assign(existing, quoted.draft);
    return { subscriber: existing, created: false as const };
  }
  return { subscriber: insertDraft(quoted.draft), created: true as const };
}

/** Seeded demo companies can send invoices without a separate signup. */
export function subscriberForVendor(vendorId: string) {
  const have = store.subscribers.get(vendorId);
  if (have) return have;
  const vendor = demoVendors.find((row) => row.id === vendorId);
  if (!vendor) return null;
  const subscriber: VendorSubscriber = {
    id: vendor.id,
    companyName: vendor.name,
    contactName: vendor.name,
    email: vendor.email || "",
    phone: vendor.phone || "",
    city: vendor.city,
    state: vendor.state,
    trade: vendor.trade,
    payments: false,
    promoCode: null,
    monthlyCents: vendorMonthlyCents(false),
    createdAt: new Date().toISOString(),
  };
  store.subscribers.set(vendor.id, subscriber);
  return subscriber;
}

export function listVendorInvoices(vendorId: string) {
  return store.invoices.filter((row) => row.vendorId === vendorId).slice().reverse();
}

export function getVendorInvoiceByToken(tokenValue: string) {
  return store.invoices.find((row) => row.token === tokenValue) || null;
}

export function composeVendorInvoice(subscriber: VendorSubscriber, input: {
  billToName: string;
  billToEmail: string;
  projectLabel: string;
  projectKey?: string | null;
  details: string;
  dueOn: string;
  lines: VendorInvoiceLine[];
}) {
  const billToEmail = input.billToEmail.trim().toLowerCase();
  if (!input.billToName.trim()) return { error: "Enter who the invoice is for.", status: 400 as const };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billToEmail)) return { error: "Enter the recipient's email.", status: 400 as const };
  const lines = input.lines
    .map((line) => ({ description: line.description.trim(), amountCents: Math.round(line.amountCents) }))
    .filter((line) => line.description && line.amountCents > 0);
  if (!lines.length) return { error: "Add at least one cost.", status: 400 as const };
  store.seq += 1;
  const invoice: VendorInvoice = {
    id: `vi-${store.seq}`,
    token: token(),
    vendorId: subscriber.id,
    number: `INV-${store.seq}`,
    billToName: input.billToName.trim(),
    billToEmail,
    projectLabel: input.projectLabel.trim(),
    projectKey: input.projectKey?.trim() || null,
    details: input.details.trim().slice(0, 800),
    dueOn: input.dueOn,
    issuedOn: new Date().toISOString().slice(0, 10),
    lines,
    totalCents: lines.reduce((sum, line) => sum + line.amountCents, 0),
    payments: subscriber.payments,
    sentAt: null,
    deliveryError: null,
    status: "draft",
    paidAt: null,
    paidSource: null,
    companyName: subscriber.companyName,
    contactName: subscriber.contactName,
    contactEmail: subscriber.email,
    contactPhone: subscriber.phone,
    contactCity: [subscriber.city, subscriber.state].filter(Boolean).join(", "),
  };
  return { invoice };
}

export function createVendorInvoice(vendorId: string, input: {
  billToName: string;
  billToEmail: string;
  projectLabel: string;
  projectKey?: string | null;
  details: string;
  dueOn: string;
  lines: VendorInvoiceLine[];
}) {
  const subscriber = subscriberForVendor(vendorId) || getVendorSubscriber(vendorId);
  if (!subscriber) return { error: "Sign up before sending an invoice.", status: 401 as const };
  const created = composeVendorInvoice(subscriber, input);
  if ("error" in created) return created;
  store.invoices.push(created.invoice);
  return created;
}

export function markVendorInvoiceSent(id: string, delivery: { sent: boolean; error?: string | null }) {
  const invoice = store.invoices.find((row) => row.id === id);
  if (!invoice) return null;
  invoice.sentAt = new Date().toISOString();
  invoice.deliveryError = delivery.sent ? null : delivery.error || "Email was not sent";
  if (invoice.status === "draft" || !invoice.status) invoice.status = "sent";
  return invoice;
}

export function markVendorInvoicePaid(tokenValue: string, source = "platform") {
  const invoice = getVendorInvoiceByToken(tokenValue);
  if (!invoice) return null;
  invoice.status = "paid";
  invoice.paidAt = new Date().toISOString();
  invoice.paidSource = source;
  return invoice;
}

export function setVendorInvoiceStatus(id: string, status: NonNullable<VendorInvoice["status"]>) {
  const invoice = store.invoices.find((row) => row.id === id);
  if (!invoice) return { error: "Invoice not found.", status: 404 as const };
  if (invoice.paidSource === "platform" && invoice.status === "paid" && status !== "paid") {
    return { error: "This invoice was paid through the platform and cannot be unmarked.", status: 409 as const };
  }
  invoice.status = status;
  if (status === "paid") {
    invoice.paidAt = invoice.paidAt || new Date().toISOString();
    invoice.paidSource = invoice.paidSource || "manual";
  } else {
    invoice.paidAt = null;
    invoice.paidSource = null;
  }
  return { invoice };
}

export function upsertVendorClient(vendorId: string, input: { name: string; email: string; projectLabel?: string; details?: string; description?: string; amountCents?: number }) {
  const email = input.email.trim().toLowerCase();
  const existing = store.invoices.find((row) => row.vendorId === vendorId && row.billToEmail === email);
  if (existing) {
    existing.billToName = input.name.trim() || existing.billToName;
  }
  return { name: input.name.trim(), email };
}

export function updateVendorClientInvoices(vendorId: string, previousEmail: string, patch: { name?: string; email?: string; projectLabel?: string; details?: string; description?: string; amount?: string }) {
  const from = previousEmail.trim().toLowerCase();
  for (const invoice of store.invoices) {
    if (invoice.vendorId !== vendorId || invoice.billToEmail !== from) continue;
    if (patch.name) invoice.billToName = patch.name;
    if (patch.email) invoice.billToEmail = patch.email.trim().toLowerCase();
    if (patch.projectLabel) invoice.projectLabel = patch.projectLabel;
    if (patch.details != null) invoice.details = patch.details;
    if (patch.description && invoice.lines[0]) invoice.lines[0].description = patch.description;
  }
}
