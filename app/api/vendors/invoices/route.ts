import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { composeVendorInvoice, createVendorInvoice, getVendorSubscriber, listVendorInvoices, markVendorInvoiceSent, setVendorInvoiceStatus, subscriberForVendor, updateVendorClientInvoices, upsertVendorClient } from "@/lib/vendor-billing-demo";
import { createLiveInvoice, linkLiveSignup, listLiveClients, listLiveInvoices, liveCompany, markLiveInvoiceSent, setLiveInvoiceStatus, updateLiveClientInvoices, upsertLiveClient } from "@/lib/vendor-billing-live";
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
  const paid = Boolean((invoice as { paidAt?: string | null }).paidAt) || invoice.status === "paid";
  const status = paid
    ? "paid"
    : invoice.status || (invoice.deliveryError ? "failed" : invoice.sentAt ? "sent" : "draft");
  return {
    id: invoice.id,
    number: invoice.number,
    billToName: invoice.billToName,
    billToEmail: invoice.billToEmail,
    projectLabel: invoice.projectLabel,
    details: invoice.details,
    lines: invoice.lines,
    totalCents: invoice.totalCents,
    dueOn: invoice.dueOn,
    issuedOn: invoice.issuedOn,
    sentAt: invoice.sentAt,
    deliveryError: invoice.deliveryError,
    status,
    paidSource: (invoice as { paidSource?: string | null }).paidSource || null,
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
  const invoices = (live ? live.invoices : listVendorInvoices(actor.vendorId)).map((row) => publicInvoice(row, origin));
  const fromInvoices = invoices.map((row) => ({
    name: row.billToName,
    email: row.billToEmail,
    projectLabel: row.projectLabel,
    details: row.details,
    amount: row.totalCents / 100,
    description: row.lines?.[0]?.description || row.projectLabel,
  }));
  const saved = actor.mode === "live" && admin ? await listLiveClients(admin, actor.vendorId, company.email) : [];
  const clients = [...new Map([...saved, ...fromInvoices].map((row) => [row.email.toLowerCase(), row])).values()];
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
    clients,
    invoices,
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
  const previousEmail = String(body.previousEmail || invoiceInput.billToEmail);
  if (body.updateClient || body.updateJob) {
    if (admin) {
      await updateLiveClientInvoices(admin, actor.vendorId, previousEmail, {
        name: body.updateClient ? invoiceInput.billToName : undefined,
        email: body.updateClient ? invoiceInput.billToEmail : undefined,
        projectLabel: body.updateJob ? invoiceInput.projectLabel : undefined,
        details: body.updateJob ? invoiceInput.details : undefined,
        description: body.updateJob ? invoiceInput.lines[0]?.description : undefined,
      });
    } else {
      updateVendorClientInvoices(actor.vendorId, previousEmail, {
        name: body.updateClient ? invoiceInput.billToName : undefined,
        email: body.updateClient ? invoiceInput.billToEmail : undefined,
        projectLabel: body.updateJob ? invoiceInput.projectLabel : undefined,
        details: body.updateJob ? invoiceInput.details : undefined,
        description: body.updateJob ? invoiceInput.lines[0]?.description : undefined,
      });
    }
  }
  const viewUrl = `${origin}/invoice/${created.invoice.token}`;
  const managerUrl = `${origin}/property-managers`;
  const delivery = await sendInvoiceEmail(created.invoice, viewUrl, managerUrl);
  if (admin) {
    const saveError = await createLiveInvoice(admin, actor.vendorId, created.invoice);
    if (saveError) return NextResponse.json({ error: saveError }, { status: 400 });
    await markLiveInvoiceSent(admin, created.invoice.token, delivery);
    await upsertLiveClient(admin, {
      vendorId: actor.vendorId,
      signupEmail: created.invoice.contactEmail,
      name: created.invoice.billToName,
      email: created.invoice.billToEmail,
      projectLabel: created.invoice.projectLabel,
      details: created.invoice.details,
      description: created.invoice.lines[0]?.description,
      amountCents: created.invoice.totalCents,
    });
  } else {
    markVendorInvoiceSent(created.invoice.id, delivery);
    upsertVendorClient(actor.vendorId, {
      name: created.invoice.billToName,
      email: created.invoice.billToEmail,
      projectLabel: created.invoice.projectLabel,
      details: created.invoice.details,
      description: created.invoice.lines[0]?.description,
      amountCents: created.invoice.totalCents,
    });
  }
  const invoice = { ...created.invoice, sentAt: new Date().toISOString(), deliveryError: delivery.sent ? null : delivery.error || "Email was not sent" };
  return NextResponse.json({
    invoice: publicInvoice(invoice, origin),
    delivery,
    viewUrl,
  });
}

export async function PATCH(request: Request) {
  const actor = await actorOrLinked();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = await request.json().catch(() => ({}));
  const invoiceId = String(body.id || "");
  const status = String(body.status || "") as "draft" | "sent" | "viewed" | "paid" | "overdue" | "void";
  if (!invoiceId || !["draft", "sent", "viewed", "paid", "overdue", "void"].includes(status)) {
    return NextResponse.json({ error: "Choose a valid invoice status." }, { status: 400 });
  }
  const admin = actor.mode === "live" ? createSupabaseAdminClient() : null;
  if (actor.mode === "live") {
    if (!admin) return NextResponse.json({ error: "Not configured." }, { status: 503 });
    const result = await setLiveInvoiceStatus(admin, actor.vendorId, invoiceId, status);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  } else {
    const result = setVendorInvoiceStatus(invoiceId, status);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const origin = new URL(request.url).origin;
  const listed = admin ? await listLiveInvoices(admin, actor.vendorId) : { invoices: listVendorInvoices(actor.vendorId) };
  return NextResponse.json({ invoices: listed.invoices.map((row) => publicInvoice(row, origin)) });
}
