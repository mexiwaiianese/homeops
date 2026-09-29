import { NextResponse } from "next/server";
import { getVendorInvoiceByToken } from "@/lib/vendor-billing-demo";
import { getLiveInvoiceByToken } from "@/lib/vendor-billing-live";
import { renderInvoicePdf } from "@/lib/vendor-invoice-pdf";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();
  const invoice = getVendorInvoiceByToken(token) || (admin ? await getLiveInvoiceByToken(admin, token) : null);
  if (!invoice) return NextResponse.json({ error: "This invoice link is not valid." }, { status: 404 });
  const pdf = renderInvoicePdf({
    companyName: invoice.companyName,
    contactName: invoice.contactName,
    contactEmail: invoice.contactEmail,
    contactPhone: invoice.contactPhone,
    contactCity: invoice.contactCity,
    invoiceNumber: invoice.number,
    issuedOn: invoice.issuedOn,
    dueOn: invoice.dueOn,
    billToName: invoice.billToName,
    billToEmail: invoice.billToEmail,
    projectLabel: invoice.projectLabel,
    details: invoice.details,
    lines: invoice.lines,
    totalCents: invoice.totalCents,
  });
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.number}.pdf"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
