import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { googleAuthEnabled } from "@/lib/google-auth";
import { getDemoInvoiceAd, isInvoiceAdAudience, normalizeInvoiceAd, saveDemoInvoiceAd, type InvoiceAdAudience } from "@/lib/invoice-ads";
import { getLiveInvoiceAd, saveLiveInvoiceAd } from "@/lib/invoice-ads-live";
import { getOperatorAdmin } from "@/lib/operator-admin";
import { resolvePersonaLoginAccess } from "@/lib/persona-login/gate";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function readAd(audience: InvoiceAdAudience) {
  const admin = createSupabaseAdminClient();
  return admin ? getLiveInvoiceAd(admin, audience) : getDemoInvoiceAd(audience);
}

/** Public: the invoice page reads the note for its audience. */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("audience");
  if (raw) {
    if (!isInvoiceAdAudience(raw)) return NextResponse.json({ error: "Unknown audience." }, { status: 400 });
    return NextResponse.json({ ad: await readAd(raw) });
  }
  if (!(await operatorAllowed())) return NextResponse.json({ error: "Unlock the operator tools first." }, { status: 403 });
  return NextResponse.json({ ads: { manager: await readAd("manager"), vendor: await readAd("vendor") } });
}

async function operatorAllowed() {
  if (googleAuthEnabled) return (await getOperatorAdmin()).allowed;
  const access = await resolvePersonaLoginAccess({
    currentUserEmail: async () => (await getAuthedContext()).user?.email ?? null,
  });
  return access.allowed;
}

/** Operator only. Google admin when that sign-in is enabled; otherwise the persona unlock. */
export async function PUT(request: Request) {
  if (!(await operatorAllowed())) return NextResponse.json({ error: "Unlock the operator tools first." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (!isInvoiceAdAudience(body.audience)) return NextResponse.json({ error: "Pick manager or vendor." }, { status: 400 });
  const ad = normalizeInvoiceAd(body.audience, body);
  if ("error" in ad) return NextResponse.json({ error: ad.error }, { status: 400 });
  const admin = createSupabaseAdminClient();
  if (admin) {
    const error = await saveLiveInvoiceAd(admin, ad);
    if (error) return NextResponse.json({ error: `${error}. Run supabase/migrations/20260928120000_vendor_self_serve.sql.` }, { status: 400 });
  } else {
    saveDemoInvoiceAd(ad);
  }
  return NextResponse.json({ ad });
}
