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

  const { data: prospect } = await catalog.admin
    .from("vendor_prospects")
    .select("*")
    .eq("organization_id", catalog.organizationId)
    .or(`id.eq.${id},source_place_id.eq.${id}`)
    .maybeSingle();
  if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  if (isScaledBrand(prospect.name)) {
    return NextResponse.json({ error: "Scaled and franchise brands are skipped. HomeOps invites owner-operators." }, { status: 400 });
  }
  const result = await inviteProspect({
    supabase: catalog.admin,
    organizationId: catalog.organizationId,
    organizationName: "portonOS",
    prospect,
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
