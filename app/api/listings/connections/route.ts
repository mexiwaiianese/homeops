import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { connectDemoNetwork, disconnectDemoNetwork, listDemoConnections } from "@/lib/listing-demo";
import { listingNetwork, type ListingNetworkId } from "@/lib/listing-networks";
import { ensureLiveConnections } from "@/lib/listing-live";

export async function PATCH(request: Request) {
  const { supabase, user, organizationId } = await getAuthedContext();
  const body = await request.json().catch(() => ({}));
  const networkId = String(body.network || "") as ListingNetworkId;
  const enabled = Boolean(body.enabled);
  if (!listingNetwork(networkId)) return NextResponse.json({ error: "Unknown listing network" }, { status: 400 });

  if (!supabase) {
    const result = enabled
      ? connectDemoNetwork(networkId, body.partnerId)
      : disconnectDemoNetwork(networkId);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({
      mode: "demo",
      connection: result.connection,
      connections: listDemoConnections(),
      message: enabled
        ? "pushConfigured" in result && result.pushConfigured
          ? `${listingNetwork(networkId)?.name} push URL is configured. Listings will be posted when you publish.`
          : `${listingNetwork(networkId)?.name} feed is ready. Share the pull URL after they approve HomeOps as a feed partner.`
        : `${listingNetwork(networkId)?.name} disconnected. Existing publications will stay in the feed until you unpublish them.`,
    });
  }

  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  await ensureLiveConnections(supabase, organizationId);
  const { data, error } = await supabase.from("listing_network_connections").update({
    status: enabled ? "feed_ready" : "disconnected",
    partner_id: body.partnerId || null,
    updated_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString(),
  }).eq("organization_id", organizationId).eq("network", networkId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const { data: connections } = await supabase.from("listing_network_connections").select("*").eq("organization_id", organizationId);
  return NextResponse.json({ mode: "live", connection: data, connections: connections ?? [] });
}
