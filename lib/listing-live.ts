import type { SupabaseClient } from "@supabase/supabase-js";
import { listingNetworks, pushUrlFor, listingNetwork, type ListingNetworkId, type RentalListing } from "@/lib/listing-networks";

function mapListing(row: any, home?: any): RentalListing {
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
}

export async function ensureLiveConnections(supabase: SupabaseClient, organizationId: string) {
  const { data } = await supabase.from("listing_network_connections").select("*").eq("organization_id", organizationId);
  const have = new Set((data ?? []).map((row: { network: string }) => row.network));
  const missing = listingNetworks.filter((network) => !have.has(network.id));
  if (missing.length) {
    await supabase.from("listing_network_connections").insert(
      missing.map((network) => ({ organization_id: organizationId, network: network.id })),
    );
  }
  const { data: rows } = await supabase.from("listing_network_connections").select("*").eq("organization_id", organizationId);
  return rows ?? [];
}

export async function listLiveListings(supabase: SupabaseClient, organizationId: string) {
  const { data, error } = await supabase
    .from("rental_listings")
    .select("*, homes(address1, city, state, postal_code)")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => mapListing(row, Array.isArray(row.homes) ? row.homes[0] : row.homes));
}

export async function upsertLiveListing(
  supabase: SupabaseClient,
  organizationId: string,
  input: Partial<RentalListing> & { homeId: string },
) {
  const { data: home } = await supabase.from("homes").select("*").eq("id", input.homeId).eq("organization_id", organizationId).maybeSingle();
  if (!home) throw new Error("Home not found");
  const payload = {
    organization_id: organizationId,
    home_id: input.homeId,
    headline: input.headline || `${home.address1} rental`,
    description: input.description || null,
    rent_cents: input.rentCents ?? home.monthly_rent_cents ?? 0,
    deposit_cents: input.depositCents ?? home.monthly_rent_cents ?? 0,
    available_on: input.availableOn || null,
    bedrooms: input.bedrooms ?? home.bedrooms,
    bathrooms: input.bathrooms ?? home.bathrooms,
    square_feet: input.squareFeet ?? home.square_feet,
    property_type: input.propertyType || "house",
    pet_policy: input.petPolicy || null,
    lease_term: input.leaseTerm || "12 months",
    status: input.status || "draft",
    photos: input.photos || [],
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("rental_listings").upsert(payload, { onConflict: "organization_id,home_id" }).select("*, homes(address1, city, state, postal_code)").single();
  if (error) throw new Error(error.message);
  return mapListing(data, Array.isArray(data.homes) ? data.homes[0] : data.homes);
}

export async function publishLiveListing(
  supabase: SupabaseClient,
  organizationId: string,
  listingId: string,
  networks: ListingNetworkId[],
) {
  const { data: row } = await supabase
    .from("rental_listings")
    .select("*, homes(address1, city, state, postal_code)")
    .eq("id", listingId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!row) throw new Error("Listing not found");
  const listing = mapListing(row, Array.isArray(row.homes) ? row.homes[0] : row.homes);
  const connections = await ensureLiveConnections(supabase, organizationId);
  const results = [];
  for (const networkId of networks) {
    const spec = listingNetwork(networkId);
    const connection = connections.find((item: { network: string }) => item.network === networkId);
    if (!spec || !connection) continue;
    let status = "published";
    let lastError = null;
    if (connection.status === "disconnected") {
      status = "error";
      lastError = `Connect ${spec.name} before publishing.`;
    } else {
      const push = pushUrlFor(spec);
      if (push) {
        try {
          const response = await fetch(push, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ network: networkId, listing }),
          });
          if (!response.ok) {
            status = "error";
            lastError = `Push to ${spec.name} returned ${response.status}`;
          }
        } catch (error) {
          status = "error";
          lastError = error instanceof Error ? error.message : "Push failed";
        }
      }
    }
    const event = {
      organization_id: organizationId,
      listing_id: listingId,
      network: networkId,
      status,
      last_error: lastError,
      published_at: status === "published" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    await supabase.from("listing_publications").upsert(event, { onConflict: "listing_id,network" });
    results.push(event);
  }
  if (results.some((row) => row.status === "published")) {
    await supabase.from("rental_listings").update({ status: "published", updated_at: new Date().toISOString() }).eq("id", listingId);
  }
  return results;
}
