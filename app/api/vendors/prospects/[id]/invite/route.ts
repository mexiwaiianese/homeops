import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { demoInviteToken, demoProspects, markDemoInvited } from "@/lib/vendor-prospect-demo";
import { invitationUrl } from "@/lib/vendor-outreach";
import { inviteProspect } from "@/lib/vendor-invite";
import { isScaledBrand } from "@/lib/vendor-prospects";
import { isNetworkAdmin } from "@/lib/vendors";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, organizationId, role } = await getAuthedContext();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const requestedChannel = body.channel === "email" || body.channel === "sms" ? body.channel : "auto";
  const origin = new URL(request.url).origin;

  if (!supabase) {
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
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!isNetworkAdmin(role)) return NextResponse.json({ error: "Network admin required" }, { status: 403 });

  const { data: prospect } = await supabase.from("vendor_prospects").select("*").eq("id", id).eq("organization_id", organizationId).maybeSingle();
  if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
  if (isScaledBrand(prospect.name)) {
    return NextResponse.json({ error: "Scaled and franchise brands are skipped. HomeOps invites owner-operators." }, { status: 400 });
  }
  const { data: org } = await supabase.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  const result = await inviteProspect({
    supabase,
    organizationId,
    organizationName: org?.name || "HomeOps",
    prospect,
    requestedChannel,
    userId: user.id,
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
