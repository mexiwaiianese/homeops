import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { listDemoListings, upsertDemoListing } from "@/lib/listing-demo";
import { upsertLiveListing } from "@/lib/listing-live";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, organizationId } = await getAuthedContext();
  const body = await request.json().catch(() => ({}));
  if (!supabase) {
    const current = listDemoListings().find((row) => row.id === id);
    if (!current) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    const result = upsertDemoListing({
      ...current,
      homeId: current.homeId,
      headline: body.headline ?? current.headline,
      description: body.description ?? current.description,
      rentCents: body.rent != null ? Math.round(Number(body.rent) * 100) : current.rentCents,
      depositCents: body.deposit != null ? Math.round(Number(body.deposit) * 100) : current.depositCents,
      availableOn: body.availableOn ?? current.availableOn,
      bedrooms: body.bedrooms != null ? Number(body.bedrooms) : current.bedrooms,
      bathrooms: body.bathrooms != null ? Number(body.bathrooms) : current.bathrooms,
      squareFeet: body.squareFeet != null ? Number(body.squareFeet) : current.squareFeet,
      petPolicy: body.petPolicy ?? current.petPolicy,
      leaseTerm: body.leaseTerm ?? current.leaseTerm,
      propertyType: body.propertyType ?? current.propertyType,
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ mode: "demo", listing: result.listing });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { data: current } = await supabase.from("rental_listings").select("home_id").eq("id", id).eq("organization_id", organizationId).maybeSingle();
  if (!current) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  try {
    const listing = await upsertLiveListing(supabase, organizationId, {
      homeId: current.home_id,
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
