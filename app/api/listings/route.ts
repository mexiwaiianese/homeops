import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { homesWithoutListing, listDemoConnections, listDemoListings, listDemoPublications, upsertDemoListing } from "@/lib/listing-demo";
import { listingNetworks } from "@/lib/listing-networks";
import { ensureLiveConnections, listLiveListings, upsertLiveListing } from "@/lib/listing-live";

function originOf(request: Request) {
  return new URL(request.url).origin;
}

function withFeedUrls(request: Request, connections: Array<{ network: string; feedToken: string; status: string; partnerId?: string | null; lastSyncedAt?: string | null }>) {
  const origin = originOf(request);
  return connections.map((row) => {
    const spec = listingNetworks.find((network) => network.id === row.network);
    return {
      ...row,
      ...spec,
      feedUrl: `${origin}/api/listings/feed/${row.network}?token=${row.feedToken}`,
    };
  });
}

export async function GET(request: Request) {
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase) {
    return NextResponse.json({
      mode: "demo",
      listings: listDemoListings(),
      publications: listDemoPublications(),
      connections: withFeedUrls(request, listDemoConnections()),
      availableHomes: homesWithoutListing(),
    });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const [listings, connections, { data: publications }, { data: homes }] = await Promise.all([
    listLiveListings(supabase, organizationId),
    ensureLiveConnections(supabase, organizationId),
    supabase.from("listing_publications").select("*").eq("organization_id", organizationId),
    supabase.from("homes").select("id,address1,city,state,monthly_rent_cents").eq("organization_id", organizationId),
  ]);
  const used = new Set(listings.map((row) => row.homeId));
  return NextResponse.json({
    mode: "live",
    listings,
    publications: publications ?? [],
    connections: withFeedUrls(request, (connections as any[]).map((row) => ({
      network: row.network,
      status: row.status,
      feedToken: row.feed_token,
      partnerId: row.partner_id,
      lastSyncedAt: row.last_synced_at,
    }))),
    availableHomes: (homes ?? []).filter((home: { id: string }) => !used.has(home.id)).map((home: any) => ({
      id: home.id,
      address: home.address1,
      city: `${home.city}, ${home.state}`,
      rent: (home.monthly_rent_cents ?? 0) / 100,
    })),
  });
}

export async function POST(request: Request) {
  const { supabase, user, organizationId } = await getAuthedContext();
  const body = await request.json().catch(() => ({}));
  const homeId = String(body.homeId || "");
  if (!homeId) return NextResponse.json({ error: "homeId is required" }, { status: 400 });
  if (!supabase) {
    const result = upsertDemoListing({
      homeId,
      headline: body.headline,
      description: body.description,
      rentCents: body.rent != null ? Math.round(Number(body.rent) * 100) : undefined,
      depositCents: body.deposit != null ? Math.round(Number(body.deposit) * 100) : undefined,
      availableOn: body.availableOn,
      bedrooms: body.bedrooms != null ? Number(body.bedrooms) : undefined,
      bathrooms: body.bathrooms != null ? Number(body.bathrooms) : undefined,
      squareFeet: body.squareFeet != null ? Number(body.squareFeet) : undefined,
      petPolicy: body.petPolicy,
      leaseTerm: body.leaseTerm,
      propertyType: body.propertyType,
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ mode: "demo", listing: result.listing });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const listing = await upsertLiveListing(supabase, organizationId, {
      homeId,
      headline: body.headline,
      description: body.description,
      rentCents: body.rent != null ? Math.round(Number(body.rent) * 100) : undefined,
      depositCents: body.deposit != null ? Math.round(Number(body.deposit) * 100) : undefined,
      availableOn: body.availableOn,
      bedrooms: body.bedrooms != null ? Number(body.bedrooms) : undefined,
      bathrooms: body.bathrooms != null ? Number(body.bathrooms) : undefined,
      squareFeet: body.squareFeet != null ? Number(body.squareFeet) : undefined,
      petPolicy: body.petPolicy,
      leaseTerm: body.leaseTerm,
      propertyType: body.propertyType,
    });
    return NextResponse.json({ mode: "live", listing });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save listing" }, { status: 400 });
  }
}
