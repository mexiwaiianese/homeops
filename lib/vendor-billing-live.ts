import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { VendorInvoice, VendorInvoiceLine } from "@/lib/vendor-billing-demo";
import { findOrgOverlap } from "@/lib/org-overlap";
import { vendorMonthlyCents } from "@/lib/vendor-plans";

const VENDOR_ONLY_PACKAGE_ID = "vendor_only";
const VENDOR_ONLY_FEATURES = {
  operations: false,
  listings: false,
  applications: false,
  payments: false,
  books: false,
  approved_vendors: false,
  owner_portal: false,
  tenant_portal: false,
  vendor_portal: true,
};

function vendorOnlyPackageRow() {
  return {
    id: VENDOR_ONLY_PACKAGE_ID,
    name: "Vendor only",
    description: "Vendor Desk access only. No property-management workspace access.",
    sort_order: 0,
    monthly_cents: 1900,
    features: VENDOR_ONLY_FEATURES,
    is_default: false,
    updated_at: new Date().toISOString(),
  };
}

function slug(email: string) {
  const local = email.split("@")[0].replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 24) || "vendor";
  return `vendor-${local}-${Math.random().toString(36).slice(2, 8)}`.toLowerCase();
}

export async function saveLiveSignup(admin: SupabaseClient, input: {
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
  /** Completed checkout replaces the plan on an existing row. */
  refreshPlan?: boolean;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeCheckoutSessionId?: string | null;
}) {
  const email = input.email.trim().toLowerCase();
  const row = {
    company_name: input.companyName.trim(),
    contact_name: input.contactName.trim(),
    email,
    phone: input.phone.trim(),
    city: input.city.trim() || null,
    state: input.state.trim() || null,
    trade: input.trade.trim() || null,
    payments: input.payments,
    promo_code: input.promoCode,
    monthly_cents: input.monthlyCents,
  };
  const stripePatch = {
    ...(input.stripeCustomerId ? { stripe_customer_id: input.stripeCustomerId } : {}),
    ...(input.stripeSubscriptionId ? { stripe_subscription_id: input.stripeSubscriptionId } : {}),
    ...(input.stripeCheckoutSessionId ? { stripe_checkout_session_id: input.stripeCheckoutSessionId } : {}),
  };
  const existing = await admin.from("vendor_self_signups").select("id, payments, monthly_cents, company_name").eq("email", email).maybeSingle();
  if (existing.error) return { error: existing.error.message };
  if (existing.data && !input.refreshPlan) {
    return { id: existing.data.id as string, created: false, payments: Boolean(existing.data.payments), monthlyCents: existing.data.monthly_cents as number, companyName: existing.data.company_name as string };
  }
  if (existing.data) {
    const updated = await writeSignup(admin, existing.data.id as string, { ...row, ...stripePatch }, Boolean(Object.keys(stripePatch).length));
    if ("error" in updated) return updated;
    return { id: existing.data.id as string, created: false, payments: input.payments, monthlyCents: input.monthlyCents, companyName: row.company_name };
  }
  const inserted = await admin.from("vendor_self_signups").insert({ ...row, ...stripePatch }).select("id, payments, monthly_cents, company_name").single();
  if (inserted.error && Object.keys(stripePatch).length && /stripe_/i.test(inserted.error.message)) {
    const retry = await admin.from("vendor_self_signups").insert(row).select("id, payments, monthly_cents, company_name").single();
    if (retry.error || !retry.data) return { error: retry.error?.message || "Could not save the signup." };
    return { id: retry.data.id as string, created: true, payments: Boolean(retry.data.payments), monthlyCents: retry.data.monthly_cents as number, companyName: retry.data.company_name as string };
  }
  if (inserted.error || !inserted.data) return { error: inserted.error?.message || "Could not save the signup." };
  return { id: inserted.data.id as string, created: true, payments: Boolean(inserted.data.payments), monthlyCents: inserted.data.monthly_cents as number, companyName: inserted.data.company_name as string };
}

async function writeSignup(admin: SupabaseClient, id: string, patch: Record<string, unknown>, dropStripeOnMissingColumn: boolean) {
  const updated = await admin.from("vendor_self_signups").update(patch).eq("id", id);
  if (updated.error && dropStripeOnMissingColumn && /stripe_/i.test(updated.error.message)) {
    const rest = Object.fromEntries(Object.entries(patch).filter(([key]) => !key.startsWith("stripe_")));
    const retry = await admin.from("vendor_self_signups").update(rest).eq("id", id);
    if (retry.error) return { error: retry.error.message };
    return { ok: true as const };
  }
  if (updated.error) return { error: updated.error.message };
  return { ok: true as const };
}

async function ensureVendorOnlyPackage(admin: SupabaseClient) {
  const packageWrite = await admin.from("subscription_packages").upsert(vendorOnlyPackageRow());
  return packageWrite.error ? { error: packageWrite.error.message } : { ok: true as const };
}

async function assignVendorOnlyPackage(admin: SupabaseClient, organizationId: string) {
  const ready = await ensureVendorOnlyPackage(admin);
  if ("error" in ready) return ready;
  const subscriptionWrite = await admin.from("organization_subscriptions").upsert({
    organization_id: organizationId,
    package_id: VENDOR_ONLY_PACKAGE_ID,
    feature_overrides: {},
    status: "active",
    updated_at: new Date().toISOString(),
  });
  return subscriptionWrite.error ? { error: subscriptionWrite.error.message } : { ok: true as const };
}

async function ensureVendorOnlyOrganization(admin: SupabaseClient, organizationId: string, userId: string) {
  const assigned = await assignVendorOnlyPackage(admin, organizationId);
  if ("error" in assigned) return assigned;
  // A Vendor Desk login is not a manager workspace member. Vendor APIs use vendor_users instead.
  const removed = await admin.from("organization_members").delete().eq("organization_id", organizationId).eq("user_id", userId);
  return removed.error ? { error: removed.error.message } : { ok: true as const };
}

/** Correct every existing Vendor Desk self-signup, including rows created before the Vendor-only package existed. */
export async function repairSelfSignupOrganizations(admin: SupabaseClient) {
  const ready = await ensureVendorOnlyPackage(admin);
  if ("error" in ready) return ready;
  const signups = await admin.from("vendor_self_signups").select("vendor_id").not("vendor_id", "is", null);
  if (signups.error) return { error: signups.error.message };
  const vendorIds = [...new Set((signups.data ?? []).map((row) => row.vendor_id).filter((id): id is string => Boolean(id)))];
  if (!vendorIds.length) return { ok: true as const, updated: 0 };
  const links = await admin.from("vendor_users").select("vendor_id, organization_id, auth_user_id").in("vendor_id", vendorIds);
  if (links.error) return { error: links.error.message };
  const rows = (links.data ?? []).filter((row) => row.organization_id);
  const organizationIds = [...new Set(rows.map((row) => row.organization_id as string))];
  if (organizationIds.length) {
    const subscriptionWrite = await admin.from("organization_subscriptions").upsert(organizationIds.map((organizationId) => ({
      organization_id: organizationId,
      package_id: VENDOR_ONLY_PACKAGE_ID,
      feature_overrides: {},
      status: "active",
      updated_at: new Date().toISOString(),
    })));
    if (subscriptionWrite.error) return { error: subscriptionWrite.error.message };
  }
  for (const row of rows) {
    if (!row.auth_user_id) continue;
    const removed = await admin.from("organization_members").delete().eq("organization_id", row.organization_id).eq("user_id", row.auth_user_id);
    if (removed.error) return { error: removed.error.message };
  }
  return { ok: true as const, updated: organizationIds.length };
}

/** A vendor created by Vendor Desk self-signup, as opposed to a vendor user invited into a manager organization. */
export async function selfSignupVendorOrganization(admin: SupabaseClient, userId: string) {
  const linked = await admin
    .from("vendor_users")
    .select("vendor_id, organization_id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!linked.data?.vendor_id || !linked.data.organization_id) return null;
  const signup = await admin.from("vendor_self_signups").select("id").eq("vendor_id", linked.data.vendor_id).maybeSingle();
  if (!signup.data) return null;
  return {
    vendorId: linked.data.vendor_id as string,
    organizationId: linked.data.organization_id as string,
  };
}

/** Repair old self-signups and enforce their Vendor-only entitlement. */
export async function ensureSelfSignupVendorAccess(admin: SupabaseClient, userId: string) {
  const linked = await selfSignupVendorOrganization(admin, userId);
  if (!linked) return null;
  const ensured = await ensureVendorOnlyOrganization(admin, linked.organizationId, userId);
  if ("error" in ensured) return null;
  return linked;
}

/** After the magic link, attach the signup to a vendor company the desk can sign in as. */
export async function linkLiveSignup(admin: SupabaseClient, user: User) {
  const email = user.email?.trim().toLowerCase();
  if (!email) return null;
  const have = await admin.from("vendor_users").select("vendor_id").eq("auth_user_id", user.id).maybeSingle();
  if (have.data?.vendor_id) {
    await ensureSelfSignupVendorAccess(admin, user.id);
    return have.data.vendor_id as string;
  }
  const signup = await admin.from("vendor_self_signups").select("*").eq("email", email).maybeSingle();
  if (signup.error || !signup.data) return null;
  if (signup.data.vendor_id) {
    const vendor = await admin.from("vendors").select("organization_id").eq("id", signup.data.vendor_id).maybeSingle();
    if (vendor.data?.organization_id) {
      await admin.from("vendor_users").upsert({
        organization_id: vendor.data.organization_id,
        vendor_id: signup.data.vendor_id,
        email,
        full_name: signup.data.contact_name,
        role: "owner",
        auth_user_id: user.id,
      }, { onConflict: "vendor_id,email" });
      await ensureVendorOnlyOrganization(admin, vendor.data.organization_id, user.id);
    }
    return signup.data.vendor_id as string;
  }
  const overlap = await findOrgOverlap(email, admin);
  if (overlap.blocked) return null;
  const org = await admin.from("organizations").insert({ name: signup.data.company_name, slug: slug(email) }).select("id").single();
  if (org.error || !org.data) return null;
  const vendor = await admin.from("vendors").insert({
    organization_id: org.data.id,
    name: signup.data.company_name,
    trade: signup.data.trade,
    email,
    phone: signup.data.phone,
  }).select("id").single();
  if (vendor.error || !vendor.data) return null;
  await admin.from("vendor_users").insert({
    organization_id: org.data.id,
    vendor_id: vendor.data.id,
    email,
    full_name: signup.data.contact_name,
    role: "owner",
    auth_user_id: user.id,
  });
  await admin.from("vendor_self_signups").update({ vendor_id: vendor.data.id }).eq("id", signup.data.id);
  const ensured = await ensureVendorOnlyOrganization(admin, org.data.id, user.id);
  if ("error" in ensured) return null;
  return vendor.data.id as string;
}

function asInvoice(row: any): VendorInvoice {
  return {
    id: row.id,
    token: row.token,
    vendorId: row.vendor_id || "",
    number: row.number,
    billToName: row.bill_to_name,
    billToEmail: row.bill_to_email,
    projectLabel: row.project_label || "",
    projectKey: row.project_key || null,
    details: row.details || "",
    dueOn: row.due_on || "",
    issuedOn: row.issued_on,
    lines: (row.lines || []) as VendorInvoiceLine[],
    totalCents: row.total_cents,
    payments: Boolean(row.payments),
    sentAt: row.sent_at,
    deliveryError: row.delivery_error,
    status: row.status || (row.paid_at ? "paid" : row.sent_at ? "sent" : "draft"),
    paidAt: row.paid_at || null,
    paidSource: row.paid_source || null,
    companyName: row.company_name,
    contactName: row.contact_name,
    contactEmail: row.contact_email || "",
    contactPhone: row.contact_phone || "",
    contactCity: row.contact_city || "",
  };
}

export async function liveCompany(admin: SupabaseClient, vendorId: string) {
  const [{ data: vendor }, { data: signup }] = await Promise.all([
    admin.from("vendors").select("name, email, phone, city, state, trade").eq("id", vendorId).maybeSingle(),
    admin.from("vendor_self_signups").select("*").eq("vendor_id", vendorId).maybeSingle(),
  ]);
  if (!vendor && !signup) return null;
  const payments = Boolean(signup?.payments);
  return {
    id: vendorId,
    companyName: signup?.company_name || vendor?.name || "Vendor",
    contactName: signup?.contact_name || vendor?.name || "Vendor",
    email: signup?.email || vendor?.email || "",
    phone: signup?.phone || vendor?.phone || "",
    city: signup?.city || vendor?.city || "",
    state: signup?.state || vendor?.state || "",
    trade: signup?.trade || vendor?.trade || "",
    payments,
    promoCode: (signup?.promo_code as string | null) || null,
    monthlyCents: signup ? (signup.monthly_cents as number) : vendorMonthlyCents(payments),
    createdAt: signup?.created_at || new Date().toISOString(),
  };
}

export async function listLiveInvoices(admin: SupabaseClient, vendorId: string) {
  const { data, error } = await admin.from("vendor_self_invoices").select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false });
  if (error) return { error: error.message, invoices: [] as VendorInvoice[] };
  return { invoices: (data ?? []).map(asInvoice) };
}

export async function getLiveInvoiceByToken(admin: SupabaseClient, token: string) {
  const { data } = await admin.from("vendor_self_invoices").select("*").eq("token", token).maybeSingle();
  return data ? asInvoice(data) : null;
}

export async function createLiveInvoice(admin: SupabaseClient, vendorId: string, invoice: VendorInvoice) {
  const { error } = await admin.from("vendor_self_invoices").insert({
    token: invoice.token,
    vendor_id: vendorId,
    signup_email: invoice.contactEmail,
    number: invoice.number,
    bill_to_name: invoice.billToName,
    bill_to_email: invoice.billToEmail,
    project_label: invoice.projectLabel || null,
    project_key: invoice.projectKey || null,
    details: invoice.details || null,
    due_on: invoice.dueOn || null,
    issued_on: invoice.issuedOn,
    lines: invoice.lines,
    total_cents: invoice.totalCents,
    payments: invoice.payments,
    company_name: invoice.companyName,
    contact_name: invoice.contactName,
    contact_email: invoice.contactEmail,
    contact_phone: invoice.contactPhone,
    contact_city: invoice.contactCity,
    status: invoice.status || "sent",
    paid_at: invoice.paidAt || null,
    paid_source: invoice.paidSource || null,
  });
  return error?.message || null;
}

export async function markLiveInvoiceSent(admin: SupabaseClient, token: string, delivery: { sent: boolean; error?: string | null }) {
  await admin.from("vendor_self_invoices").update({
    sent_at: new Date().toISOString(),
    delivery_error: delivery.sent ? null : delivery.error || "Email was not sent",
    status: "sent",
  }).eq("token", token);
}

export async function markLiveInvoicePaid(admin: SupabaseClient, token: string, source = "platform") {
  await admin.from("vendor_self_invoices").update({
    status: "paid",
    paid_at: new Date().toISOString(),
    paid_source: source,
  }).eq("token", token);
}

export async function setLiveInvoiceStatus(admin: SupabaseClient, vendorId: string, invoiceId: string, status: string) {
  const { data } = await admin.from("vendor_self_invoices").select("id, status, paid_source").eq("id", invoiceId).eq("vendor_id", vendorId).maybeSingle();
  if (!data) return { error: "Invoice not found." };
  if (data.paid_source === "platform" && data.status === "paid" && status !== "paid") {
    return { error: "This invoice was paid through the platform and cannot be unmarked." };
  }
  const patch: Record<string, unknown> = { status };
  if (status === "paid") {
    patch.paid_at = new Date().toISOString();
    patch.paid_source = data.paid_source || "manual";
  } else {
    patch.paid_at = null;
    patch.paid_source = null;
  }
  const { error } = await admin.from("vendor_self_invoices").update(patch).eq("id", invoiceId).eq("vendor_id", vendorId);
  return error ? { error: error.message } : { ok: true as const };
}

export async function upsertLiveClient(admin: SupabaseClient, input: {
  vendorId: string;
  signupEmail: string;
  name: string;
  email: string;
  projectLabel?: string;
  details?: string;
  description?: string;
  amountCents?: number;
}) {
  const email = input.email.trim().toLowerCase();
  await admin.from("vendor_self_clients").upsert({
    vendor_id: input.vendorId,
    signup_email: input.signupEmail.trim().toLowerCase(),
    name: input.name.trim(),
    email,
    project_label: input.projectLabel || null,
    details: input.details || null,
    description: input.description || null,
    amount_cents: input.amountCents ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "signup_email,email" });
}

export async function updateLiveClientInvoices(admin: SupabaseClient, vendorId: string, previousEmail: string, patch: { name?: string; email?: string; projectLabel?: string; details?: string; description?: string }) {
  const from = previousEmail.trim().toLowerCase();
  const row: Record<string, unknown> = {};
  if (patch.name) row.bill_to_name = patch.name;
  if (patch.email) row.bill_to_email = patch.email.trim().toLowerCase();
  if (patch.projectLabel) row.project_label = patch.projectLabel;
  if (patch.details != null) row.details = patch.details;
  if (Object.keys(row).length) {
    await admin.from("vendor_self_invoices").update(row).eq("vendor_id", vendorId).eq("bill_to_email", from);
  }
}

export async function listLiveClients(admin: SupabaseClient, vendorId: string, signupEmail: string) {
  const { data } = await admin.from("vendor_self_clients").select("*").or(`vendor_id.eq.${vendorId},signup_email.eq.${signupEmail}`).order("updated_at", { ascending: false });
  return (data ?? []).map((row: any) => ({
    name: row.name as string,
    email: row.email as string,
    projectLabel: (row.project_label as string) || "",
    details: (row.details as string) || "",
    amount: row.amount_cents ? Number(row.amount_cents) / 100 : 0,
    description: (row.description as string) || "",
  }));
}
