import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/http-security";
import { findInvoiceOffer, trackInvoiceOfferEvent } from "@/lib/invoice-recipient-platform";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createSupabaseAdminClient();
  const offer = await findInvoiceOffer(admin, token);
  if (!offer) return NextResponse.redirect(`${appOrigin(request)}/pricing?offer=unavailable`, 302);
  const requestUrl = new URL(request.url);
  const placement = String(requestUrl.searchParams.get("placement") || "invoice").slice(0, 40);
  const invoiceToken = String(requestUrl.searchParams.get("invoice") || "").slice(0, 200) || null;
  await trackInvoiceOfferEvent(admin, {
    offerToken: token,
    clientId: offer.clientId,
    invoiceToken,
    eventType: "click",
    placement,
  });
  const destination = new URL("/register", appOrigin(request));
  destination.searchParams.set("offer", token);
  destination.searchParams.set("utm_source", "vendor_invoice");
  destination.searchParams.set("utm_medium", "invoice");
  destination.searchParams.set("utm_campaign", "three_month_platform_offer");
  destination.searchParams.set("utm_content", placement);
  return NextResponse.redirect(destination, 302);
}
