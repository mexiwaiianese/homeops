import { NextResponse } from "next/server";
import { findDemoConnectionByToken, publishedDemoListingsFor } from "@/lib/listing-demo";
import { listingNetwork, renderFeed, type ListingNetworkId } from "@/lib/listing-networks";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request, { params }: { params: Promise<{ network: string }> }) {
  const { network } = await params;
  const spec = listingNetwork(network);
  if (!spec) return NextResponse.json({ error: "Unknown listing network" }, { status: 404 });
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!token) return NextResponse.json({ error: "Feed token required" }, { status: 401 });

  const demo = findDemoConnectionByToken(token);
  if (demo) {
    if (demo.network !== network) return NextResponse.json({ error: "Token does not match this network." }, { status: 403 });
    if (demo.status === "disconnected") return NextResponse.json({ error: "This listing network is disconnected." }, { status: 409 });
    const feed = renderFeed(spec, publishedDemoListingsFor(network as ListingNetworkId));
    return new NextResponse(feed.body, { headers: { "Content-Type": feed.contentType, "Cache-Control": "no-store" } });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Feed is not available." }, { status: 404 });
  const { data: connection } = await admin.from("listing_network_connections").select("*").eq("feed_token", token).eq("network", network).maybeSingle();
  if (!connection) return NextResponse.json({ error: "Feed token is invalid." }, { status: 404 });
  if (connection.status === "disconnected") return NextResponse.json({ error: "This listing network is disconnected." }, { status: 409 });
  const { data: publications } = await admin.from("listing_publications").select("listing_id").eq("organization_id", connection.organization_id).eq("network", network).eq("status", "published");
  const ids = (publications ?? []).map((row: { listing_id: string }) => row.listing_id);
  const { data: rows } = ids.length
    ? await admin.from("rental_listings").select("*, homes(address1, city, state, postal_code)").in("id", ids)
    : { data: [] };
  const listings = (rows ?? []).map((row: any) => {
    const home = Array.isArray(row.homes) ? row.homes[0] : row.homes;
    return {
      id: row.id,
      homeId: row.home_id,
      address: home?.address1 || "",
      city: home?.city || "",
      state: home?.state || "",
      postalCode: home?.postal_code || "",
      headline: row.headline,
      description: row.description || "",
      rentCents: row.rent_cents,
      depositCents: row.deposit_cents,
      availableOn: row.available_on,
      bedrooms: Number(row.bedrooms ?? 0),
      bathrooms: Number(row.bathrooms ?? 0),
      squareFeet: Number(row.square_feet ?? 0),
      propertyType: row.property_type,
      petPolicy: row.pet_policy || "",
      leaseTerm: row.lease_term || "",
      status: row.status,
      photos: Array.isArray(row.photos) ? row.photos : [],
      updatedAt: row.updated_at,
    };
  });
  const feed = renderFeed(spec, listings);
  return new NextResponse(feed.body, { headers: { "Content-Type": feed.contentType, "Cache-Control": "no-store" } });
}
