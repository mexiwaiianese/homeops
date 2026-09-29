import type { VendorInvoice } from "@/lib/vendor-billing-demo";
import { sendVendorEmail } from "@/lib/vendor-outreach";

export function invoiceEmailCopy(invoice: VendorInvoice, viewUrl: string, managerUrl: string) {
  const total = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(invoice.totalCents / 100);
  return [
    `${invoice.companyName} sent you an invoice for ${total}.`,
    invoice.projectLabel ? `Project: ${invoice.projectLabel}` : "",
    invoice.dueOn ? `Due: ${invoice.dueOn}` : "",
    "",
    `View the invoice: ${viewUrl}`,
    "",
    `${invoice.contactName}`,
    [invoice.contactPhone, invoice.contactEmail].filter(Boolean).join(" · "),
    invoice.contactCity,
    "",
    "—",
    "HomeOps is the desk property managers use to dispatch work, approve vendors, and see the cost on each property.",
    `See the platform: ${managerUrl}`,
  ].filter((line) => line !== "").join("\n");
}

export async function sendInvoiceEmail(invoice: VendorInvoice, viewUrl: string, managerUrl: string) {
  return sendVendorEmail({
    to: invoice.billToEmail,
    subject: `Invoice ${invoice.number} from ${invoice.companyName}`,
    text: invoiceEmailCopy(invoice, viewUrl, managerUrl),
  });
}
