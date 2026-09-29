import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { VendorInvoice, VendorInvoiceLine } from "@/lib/vendor-billing-demo";
import { vendorMonthlyCents } from "@/lib/vendor-plans";

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
  const existing = await admin.from("vendor_self_signups").select("id, payments, monthly_cents, company_name").eq("email", email).maybeSingle();
  if (existing.error) return { error: existing.error.message };
  if (existing.data) return { id: existing.data.id as string, created: false, payments: Boolean(existing.data.payments), monthlyCents: existing.data.monthly_cents as number, companyName: existing.data.company_name as string };
  const inserted = await admin.from("vendor_self_signups").insert(row).select("id, payments, monthly_cents, company_name").single();
  if (inserted.error || !inserted.data) return { error: inserted.error?.message || "Could not save the signup." };
  return { id: inserted.data.id as string, created: true, payments: Boolean(inserted.data.payments), monthlyCents: inserted.data.monthly_cents as number, companyName: inserted.data.company_name as string };
}

/** After the magic link, attach the signup to a vendor company the desk can sign in as. */
export async function linkLiveSignup(admin: SupabaseClient, user: User) {
  const email = user.email?.trim().toLowerCase();
  if (!email) return null;
  const have = await admin.from("vendor_users").select("vendor_id").eq("auth_user_id", user.id).maybeSingle();
  if (have.data?.vendor_id) return have.data.vendor_id as string;
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
    }
    return signup.data.vendor_id as string;
  }
  const org = await admin.from("organizations").insert({ name: signup.data.company_name, slug: slug(email) }).select("id").single();
  if (org.error || !org.data) return null;
  await admin.from("organization_members").insert({ organization_id: org.data.id, user_id: user.id, role: "owner" });
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
  });
  return error?.message || null;
}

export async function markLiveInvoiceSent(admin: SupabaseClient, token: string, delivery: { sent: boolean; error?: string | null }) {
  await admin.from("vendor_self_invoices").update({
    sent_at: new Date().toISOString(),
    delivery_error: delivery.sent ? null : delivery.error || "Email was not sent",
  }).eq("token", token);
}
