import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { discoverRecipientPlatform, getRecipientPlatformProfile, saveRecipientPlatformProfile } from "@/lib/invoice-recipient-platform";
import { getVendorSubscriber, subscriberForVendor } from "@/lib/vendor-billing-demo";
import { liveCompany } from "@/lib/vendor-billing-live";
import { requireVendorActor } from "@/lib/vendor-session";

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  const actor = await requireVendorActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  if (!name || !validEmail(email)) return NextResponse.json({ error: "Enter the client's company name and a valid email first." }, { status: 400 });

  const admin = actor.mode === "live" ? createSupabaseAdminClient() : null;
  if (actor.mode === "live" && !admin) return NextResponse.json({ error: "Platform research is not configured." }, { status: 503 });
  const company = admin
    ? await liveCompany(admin, actor.vendorId)
    : getVendorSubscriber(actor.vendorId) || subscriberForVendor(actor.vendorId);
  if (!company) return NextResponse.json({ error: "Sign up before adding invoice clients." }, { status: 401 });

  const current = await getRecipientPlatformProfile(admin, actor.vendorId, email);
  const fresh = current?.searchedAt && current.nextSearchAt && new Date(current.nextSearchAt).getTime() > Date.now();
  if (fresh && body.force !== true) return NextResponse.json({ profile: publicProfile(current), cached: true });

  const result = await discoverRecipientPlatform(name, email);
  const profile = await saveRecipientPlatformProfile(admin, {
    vendorId: actor.vendorId,
    signupEmail: company.email,
    name,
    email,
    status: result.status,
    answer: result.answer,
    existingOfferToken: current?.offerToken,
  });
  return NextResponse.json({ profile: publicProfile(profile), cached: false, note: result.note });
}

function publicProfile(profile: Awaited<ReturnType<typeof saveRecipientPlatformProfile>>) {
  return {
    provider: profile.provider,
    confidence: profile.confidence,
    status: profile.status,
    searchedAt: profile.searchedAt,
    nextSearchAt: profile.nextSearchAt,
    personalized: Boolean(profile.ad),
  };
}
