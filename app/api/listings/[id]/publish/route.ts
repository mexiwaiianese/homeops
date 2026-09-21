import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { publishDemoListing, unpublishDemoListing } from "@/lib/listing-demo";
import { listingNetwork, type ListingNetworkId } from "@/lib/listing-networks";
import { publishLiveListing } from "@/lib/listing-live";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, organizationId } = await getAuthedContext();
  const body = await request.json().catch(() => ({}));
  const networks = (Array.isArray(body.networks) ? body.networks : []).filter((row: string) => listingNetwork(row)) as ListingNetworkId[];
  if (!networks.length) return NextResponse.json({ error: "Choose at least one listing network." }, { status: 400 });
  if (!supabase) {
    const result = await publishDemoListing(id, networks);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ mode: "demo", ...result });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const publications = await publishLiveListing(supabase, organizationId, id, networks);
    return NextResponse.json({ mode: "live", publications });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not publish" }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, organizationId } = await getAuthedContext();
  const network = new URL(request.url).searchParams.get("network") as ListingNetworkId | null;
  if (!supabase) {
    const result = unpublishDemoListing(id, network || undefined);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ mode: "demo", listing: result.listing });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const query = supabase.from("listing_publications").update({
    status: "unpublished",
    published_at: null,
    updated_at: new Date().toISOString(),
  }).eq("listing_id", id).eq("organization_id", organizationId);
  if (network) query.eq("network", network);
  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await supabase.from("rental_listings").update({ status: "paused", updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ mode: "live", unpublished: true });
}
