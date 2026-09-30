import { NextResponse } from "next/server";
import { demoInviteToken, demoProspects, markDemoInvited } from "@/lib/vendor-prospect-demo";
import { invitationUrl } from "@/lib/vendor-outreach";
import { inviteProspect } from "@/lib/vendor-invite";
import { isScaledBrand } from "@/lib/vendor-prospects";
import { requirePlatformAdmin } from "@/lib/operator-admin";
import { getPlatformCatalog } from "@/lib/platform-catalog";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return admin.response;
  const catalog = await getPlatformCatalog();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const requestedChannel = body.channel === "email" || body.channel === "sms" ? body.channel : "auto";
  const origin = new URL(request.url).origin;

  if (!catalog.ok) {
    const prospect = demoProspects.find((row) => row.sourcePlaceId === id);
    if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
    if (isScaledBrand(prospect.name)) {
      return NextResponse.json({ error: "Scaled and franchise brands are skipped. HomeOps invites owner-operators." }, { status: 400 });
    }
    const token = demoInviteToken(prospect.sourcePlaceId);
    const inviteUrl = invitationUrl(token, origin);
    markDemoInvited(prospect.sourcePlaceId, inviteUrl);
    return NextResponse.json({
      mode: "demo",
      delivered: false,
      channel: prospect.email ? "email" : "sms",
      sentTo: prospect.email || prospect.phone,
      inviteUrl,
      deliveryError: "Demo mode generated a registration link. Connect email/SMS providers to send it.",
    });
  }

  const { data: matches } = await catalog.admin
    .from("vendor_prospects")
    .select("*")
    .or(`id.eq.${id},source_place_id.eq.${id}`);
  const prospect = (matches ?? []).find((row) => row.organization_id === catalog.organizationId)
    ?? (matches ?? [])[0];
  if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  let catalogProspect = prospect;
  if (prospect.organization_id !== catalog.organizationId) {
    const { data: existing } = await catalog.admin
      .from("vendor_prospects")
      .select("*")
      .eq("organization_id", catalog.organizationId)
      .eq("source", prospect.source)
      .eq("source_place_id", prospect.source_place_id)
      .maybeSingle();
    if (existing) {
      catalogProspect = existing;
    } else {
      const { data: copied, error: copyError } = await catalog.admin.from("vendor_prospects").insert({
        organization_id: catalog.organizationId,
        source: prospect.source,
        source_place_id: prospect.source_place_id,
        name: prospect.name,
        normalized_name: prospect.normalized_name,
        identity_fingerprint: prospect.identity_fingerprint,
        category_slug: prospect.category_slug,
        category_name: prospect.category_name,
        phone: prospect.phone,
        email: prospect.email,
        website: prospect.website,
        address1: prospect.address1,
        city: prospect.city,
        state: prospect.state,
        postal_code: prospect.postal_code,
        public_rating: prospect.public_rating,
        review_count: prospect.review_count,
        public_rank_score: prospect.public_rank_score,
        editorial_summary: prospect.editorial_summary,
        maps_url: prospect.maps_url,
        vendor_id: null,
        outreach_status: prospect.outreach_status === "registered" ? "discovered" : prospect.outreach_status,
        last_discovered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select().single();
      if (copyError || !copied) return NextResponse.json({ error: copyError?.message || "Could not add this prospect to the catalog" }, { status: 400 });
      catalogProspect = copied;
    }
  }
  if (isScaledBrand(catalogProspect.name)) {
    return NextResponse.json({ error: "Scaled and franchise brands are skipped. HomeOps invites owner-operators." }, { status: 400 });
  }
  const result = await inviteProspect({
    supabase: catalog.admin,
    organizationId: catalog.organizationId,
    organizationName: "portonOS",
    prospect: catalogProspect,
    requestedChannel,
    userId: admin.user?.id ?? null,
    baseUrl: origin,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({
    mode: "live",
    invitation: { id: result.invitation.id, token: result.invitation.token },
    vendorId: result.vendorId,
    inviteUrl: result.inviteUrl,
    channel: result.channel,
    sentTo: result.sentTo,
    delivered: result.delivered,
    deliveryError: result.deliveryError,
  });
}
