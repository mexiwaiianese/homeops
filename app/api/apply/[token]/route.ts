import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { draftToRow, parseApplicationDraft } from "@/lib/applications";
import { publicDemoListing, submitDemoApplication } from "@/lib/application-demo";
import { insertLiveApplication, publicLiveListing } from "@/lib/application-live";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { stripeReady } from "@/lib/stripe";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!isSupabaseConfigured()) {
    const found = publicDemoListing(token);
    if (!found) return NextResponse.json({ error: "This application link is not valid." }, { status: 404 });
    return NextResponse.json({ mode: "demo", listing: found.listing, stripe: stripeReady() });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "This application link is not valid." }, { status: 404 });
  const found = await publicLiveListing(admin, token);
  if (!found) return NextResponse.json({ error: "This application link is not valid." }, { status: 404 });
  return NextResponse.json({ mode: "live", listing: found.listing, stripe: stripeReady() });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = parseApplicationDraft(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  if (!isSupabaseConfigured()) {
    const result = submitDemoApplication(token, parsed.draft);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ applicationId: result.application.id, feeCents: result.application.feeCents, feeStatus: result.application.feeStatus }, { status: 201 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "This application link is not valid." }, { status: 404 });
  const found = await publicLiveListing(admin, token);
  if (!found) return NextResponse.json({ error: "This application link is not valid." }, { status: 404 });
  if (found.listing.status === "leased") return NextResponse.json({ error: "This home is no longer available." }, { status: 409 });
  const application = await insertLiveApplication(admin, {
    organizationId: found.organizationId,
    listingId: found.listingId,
    homeId: found.homeId,
    feeCents: found.listing.feeCents,
    fields: draftToRow(parsed.draft),
  });
  return NextResponse.json({ applicationId: application.id, feeCents: application.feeCents, feeStatus: application.feeStatus }, { status: 201 });
}
