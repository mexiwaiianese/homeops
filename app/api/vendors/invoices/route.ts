import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { composeVendorInvoice, createVendorInvoice, getVendorSubscriber, listVendorInvoices, markVendorInvoiceSent, subscriberForVendor } from "@/lib/vendor-billing-demo";
import { createLiveInvoice, linkLiveSignup, listLiveInvoices, liveCompany, markLiveInvoiceSent } from "@/lib/vendor-billing-live";
import { sendInvoiceEmail } from "@/lib/vendor-invoice-mail";
import { demoInvoiceProjects, liveInvoiceProjects } from "@/lib/vendor-invoice-projects";
import { dollars } from "@/lib/vendor-plans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireVendorActor } from "@/lib/vendor-session";

async function actorOrLinked() {
  let actor = await requireVendorActor();
  if ("error" in actor && actor.status === 403) {
    const ctx = await getAuthedContext();
    const admin = createSupabaseAdminClient();
    if (ctx.user && admin) await linkLiveSignup(admin, ctx.user);
    actor = await requireVendorActor();
  }
  return actor;
}

function publicInvoice(invoice: ReturnType<typeof listVendorInvoices>[number], origin: string) {
  return {
    id: invoice.id,
    number: invoice.number,
    billToName: invoice.billToName,
    billToEmail: invoice.billToEmail,
    projectLabel: invoice.projectLabel,
    totalCents: invoice.totalCents,
    dueOn: invoice.dueOn,
    issuedOn: invoice.issuedOn,
    sentAt: invoice.sentAt,
    deliveryError: invoice.deliveryError,
    viewUrl: `${origin}/invoice/${invoice.token}`,
  };
}

export async function GET(request: Request) {
  const actor = await actorOrLinked();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const origin = new URL(request.url).origin;
  const subscriber = getVendorSubscriber(actor.vendorId) || subscriberForVendor(actor.vendorId);
  const admin = createSupabaseAdminClient();
  const company = subscriber || (actor.mode === "live" && admin ? await liveCompany(admin, actor.vendorId) : null);
  if (!company) return NextResponse.json({ error: "Sign up to send invoices." }, { status: 401 });
  const live = actor.mode === "live" && admin ? await listLiveInvoices(admin, actor.vendorId) : null;
  if (live && "error" in live && live.error) return NextResponse.json({ error: live.error }, { status: 400 });
  const planSubscriber = company;
  // Each time the invoice screen opens, look for this company's name or email among the vendors
  // property managers already set up, and list those bids and jobs under Project.
  const linked = actor.mode === "live" && admin
    ? await liveInvoiceProjects(admin, company, actor.vendorId)
    : demoInvoiceProjects(company);
  return NextResponse.json({
    mode: actor.mode,
    platform: {
      matches: linked.matches.filter((row) => row.matchedBy !== "account"),
      projects: linked.projects,
    },
    plan: planSubscriber ? {
      payments: planSubscriber.payments,
      monthlyCents: planSubscriber.monthlyCents,
      label: `${planSubscriber.monthlyCents === 0 ? "Free" : `${dollars(planSubscriber.monthlyCents)}/mo`}${planSubscriber.payments ? " · invoices and online pay" : " · email invoices"}`,
    } : { payments: false, monthlyCents: 1900, label: `${dollars(1900)}/mo · email invoices` },
    company: planSubscriber ? {
      name: planSubscriber.companyName,
      contact: planSubscriber.contactName,
      email: planSubscriber.email,
      phone: planSubscriber.phone,
      city: [planSubscriber.city, planSubscriber.state].filter(Boolean).join(", "),
    } : null,
    invoices: (live ? live.invoices : listVendorInvoices(actor.vendorId)).map((row) => publicInvoice(row, origin)),
  });
}

export async function POST(request: Request) {
  const actor = await actorOrLinked();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const origin = new URL(request.url).origin;
  const body = await request.json().catch(() => ({}));
  const lines = Array.isArray(body.lines) ? body.lines : [];
  const invoiceInput = {
    billToName: String(body.billToName || ""),
    billToEmail: String(body.billToEmail || ""),
    projectLabel: String(body.projectLabel || ""),
    projectKey: String(body.projectKey || "") || null,
    details: String(body.details || ""),
    dueOn: String(body.dueOn || ""),
    lines: lines.map((line: { description?: string; amount?: number | string }) => ({
      description: String(line.description || ""),
      amountCents: Math.round(Number(line.amount) * 100),
    })),
  };
  const admin = actor.mode === "live" ? createSupabaseAdminClient() : null;
  const company = actor.mode === "live" && admin ? await liveCompany(admin, actor.vendorId) : null;
  const created = company ? composeVendorInvoice(company, invoiceInput) : createVendorInvoice(actor.vendorId, invoiceInput);
  if ("error" in created) return NextResponse.json({ error: created.error }, { status: created.status });
  const viewUrl = `${origin}/invoice/${created.invoice.token}`;
  const managerUrl = `${origin}/property-managers`;
  const delivery = await sendInvoiceEmail(created.invoice, viewUrl, managerUrl);
  if (admin) {
    const saveError = await createLiveInvoice(admin, actor.vendorId, created.invoice);
    if (saveError) return NextResponse.json({ error: saveError }, { status: 400 });
    await markLiveInvoiceSent(admin, created.invoice.token, delivery);
  } else {
    markVendorInvoiceSent(created.invoice.id, delivery);
  }
  const invoice = { ...created.invoice, sentAt: new Date().toISOString(), deliveryError: delivery.sent ? null : delivery.error || "Email was not sent" };
  return NextResponse.json({
    invoice: publicInvoice(invoice, origin),
    delivery,
    viewUrl,
  });
}
