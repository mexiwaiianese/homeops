import { homes, tenants } from "@/lib/data";
import {
  listingNetworks,
  pushUrlFor,
  listingNetwork,
  type ListingConnection,
  type ListingNetworkId,
  type ListingPublication,
  type RentalListing,
} from "@/lib/listing-networks";

type ListingStore = {
  listings: Map<string, RentalListing>;
  publications: Map<string, ListingPublication>;
  connections: Map<ListingNetworkId, ListingConnection>;
};

const store: ListingStore =
  ((globalThis as typeof globalThis & { __homeopsListings?: ListingStore }).__homeopsListings ??= {
    listings: new Map(),
    publications: new Map(),
    connections: new Map(),
  });

function token() {
  return `ils-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function seedIfNeeded() {
  if (store.listings.size) return;
  const home = homes.find((row) => row.id === "h2")!;
  const listing: RentalListing = {
    id: "lst-h2",
    homeId: home.id,
    address: home.address,
    city: home.city.split(",")[0],
    state: "UT",
    postalCode: "84043",
    headline: "3 bed in Example City — available mid-October",
    description: "Single-family rental with updated HVAC and a fenced yard. Shown after current lease ends. Apply through HomeOps; this is not a public marketplace.",
    rentCents: Math.round(home.rent * 100),
    depositCents: Math.round(home.rent * 100),
    availableOn: home.leaseEnds,
    bedrooms: 3,
    bathrooms: 2.5,
    squareFeet: 1680,
    propertyType: "house",
    petPolicy: "Cats and dogs considered with deposit",
    leaseTerm: "12 months",
    status: "draft",
    photos: [],
    updatedAt: new Date().toISOString(),
  };
  store.listings.set(listing.id, listing);
  for (const network of listingNetworks) {
    store.connections.set(network.id, {
      network: network.id,
      status: "disconnected",
      feedToken: token(),
      partnerId: null,
      lastSyncedAt: null,
    });
  }
}

seedIfNeeded();

/** Drop listings, publications, and network connections; the next read re-seeds the draft listing. */
export function resetDemoListings() {
  store.listings.clear();
  store.publications.clear();
  store.connections.clear();
}

function pubKey(listingId: string, network: ListingNetworkId) {
  return `${listingId}:${network}`;
}

export function listDemoListings() {
  seedIfNeeded();
  return [...store.listings.values()].sort((a, b) => a.address.localeCompare(b.address));
}

export function listDemoPublications() {
  seedIfNeeded();
  return [...store.publications.values()];
}

export function listDemoConnections() {
  seedIfNeeded();
  return listingNetworks.map((network) => store.connections.get(network.id)!);
}

export function homesWithoutListing() {
  seedIfNeeded();
  const used = new Set(listDemoListings().map((row) => row.homeId));
  return homes.filter((home) => !used.has(home.id)).map((home) => {
    const tenant = tenants.find((row) => row.id === home.tenantId);
    return { id: home.id, address: home.address, city: home.city, rent: home.rent, leaseEnds: home.leaseEnds, occupied: Boolean(tenant) };
  });
}

export function upsertDemoListing(input: Partial<RentalListing> & { homeId: string }) {
  seedIfNeeded();
  const existing = [...store.listings.values()].find((row) => row.homeId === input.homeId);
  const home = homes.find((row) => row.id === input.homeId);
  if (!home) return { error: "Home not found", status: 404 as const };
  const id = existing?.id || `lst-${input.homeId}`;
  const listing: RentalListing = {
    id,
    homeId: input.homeId,
    address: input.address || existing?.address || home.address,
    city: input.city || existing?.city || home.city.split(",")[0],
    state: input.state || existing?.state || "UT",
    postalCode: input.postalCode || existing?.postalCode || "84043",
    headline: input.headline || existing?.headline || `${home.address} rental`,
    description: input.description || existing?.description || "Single-family rental managed in HomeOps.",
    rentCents: input.rentCents ?? existing?.rentCents ?? Math.round(home.rent * 100),
    depositCents: input.depositCents ?? existing?.depositCents ?? Math.round(home.rent * 100),
    availableOn: input.availableOn || existing?.availableOn || home.leaseEnds,
    bedrooms: input.bedrooms ?? existing?.bedrooms ?? 3,
    bathrooms: input.bathrooms ?? existing?.bathrooms ?? 2,
    squareFeet: input.squareFeet ?? existing?.squareFeet ?? 1400,
    propertyType: input.propertyType || existing?.propertyType || "house",
    petPolicy: input.petPolicy || existing?.petPolicy || "Contact manager",
    leaseTerm: input.leaseTerm || existing?.leaseTerm || "12 months",
    status: input.status || existing?.status || "draft",
    photos: input.photos || existing?.photos || [],
    updatedAt: new Date().toISOString(),
  };
  store.listings.set(id, listing);
  return { listing };
}

export function connectDemoNetwork(networkId: ListingNetworkId, partnerId?: string | null) {
  seedIfNeeded();
  const spec = listingNetwork(networkId);
  if (!spec) return { error: "Unknown listing network", status: 404 as const };
  const current = store.connections.get(networkId)!;
  const push = pushUrlFor(spec);
  current.status = push ? "connected" : "feed_ready";
  current.partnerId = partnerId ?? current.partnerId;
  current.lastSyncedAt = new Date().toISOString();
  return { connection: current, pushConfigured: Boolean(push) };
}

export function disconnectDemoNetwork(networkId: ListingNetworkId) {
  seedIfNeeded();
  const current = store.connections.get(networkId);
  if (!current) return { error: "Unknown listing network", status: 404 as const };
  current.status = "disconnected";
  current.lastSyncedAt = new Date().toISOString();
  return { connection: current };
}

export async function publishDemoListing(listingId: string, networks: ListingNetworkId[]) {
  seedIfNeeded();
  const listing = store.listings.get(listingId);
  if (!listing) return { error: "Listing not found", status: 404 as const };
  const results: ListingPublication[] = [];
  for (const networkId of networks) {
    const spec = listingNetwork(networkId);
    const connection = store.connections.get(networkId);
    if (!spec || !connection) continue;
    const key = pubKey(listingId, networkId);
    if (connection.status === "disconnected") {
      const publication: ListingPublication = {
        listingId,
        network: networkId,
        status: "error",
        lastError: `Connect ${spec.name} before publishing. HomeOps can host the feed as soon as the network is enabled.`,
      };
      store.publications.set(key, publication);
      results.push(publication);
      continue;
    }
    const push = pushUrlFor(spec);
    let status: ListingPublication["status"] = "published";
    let lastError: string | null = null;
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
    const publication: ListingPublication = {
      listingId,
      network: networkId,
      status,
      lastError,
      publishedAt: status === "published" ? new Date().toISOString() : null,
      externalId: connection.partnerId || listing.id,
    };
    store.publications.set(key, publication);
    results.push(publication);
    connection.lastSyncedAt = new Date().toISOString();
  }
  if (results.some((row) => row.status === "published")) listing.status = "published";
  listing.updatedAt = new Date().toISOString();
  return { listing, publications: results };
}

export function unpublishDemoListing(listingId: string, networkId?: ListingNetworkId) {
  seedIfNeeded();
  const listing = store.listings.get(listingId);
  if (!listing) return { error: "Listing not found", status: 404 as const };
  const targets = networkId ? [networkId] : listingNetworks.map((row) => row.id);
  for (const id of targets) {
    const key = pubKey(listingId, id);
    const current = store.publications.get(key);
    if (!current) continue;
    store.publications.set(key, { ...current, status: "unpublished", publishedAt: null });
  }
  const stillLive = listDemoPublications().some((row) => row.listingId === listingId && row.status === "published");
  listing.status = stillLive ? "published" : "paused";
  listing.updatedAt = new Date().toISOString();
  return { listing };
}

export function publishedDemoListingsFor(networkId: ListingNetworkId) {
  seedIfNeeded();
  const live = new Set(
    listDemoPublications()
      .filter((row) => row.network === networkId && row.status === "published")
      .map((row) => row.listingId),
  );
  return listDemoListings().filter((row) => live.has(row.id) && (row.status === "published" || row.status === "paused"));
}

export function findDemoConnectionByToken(tokenValue: string) {
  seedIfNeeded();
  return listDemoConnections().find((row) => row.feedToken === tokenValue) || null;
}
