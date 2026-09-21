export type ListingNetworkId = "zillow" | "apartments" | "rent" | "realtor" | "zumper";
export type ListingStatus = "draft" | "published" | "paused" | "leased";
export type PublicationStatus = "queued" | "published" | "error" | "unpublished";
export type ConnectionStatus = "disconnected" | "feed_ready" | "connected" | "error";
export type FeedFormat = "zillow_xml" | "mits_xml" | "json";

export type ListingNetwork = {
  id: ListingNetworkId;
  name: string;
  sites: string[];
  format: FeedFormat;
  family: "zillow_group" | "costar" | "move" | "zumper";
  onboarding: string;
  docsUrl?: string;
  applyEmail?: string;
  envPushUrl?: string;
};

export type RentalListing = {
  id: string;
  homeId: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  headline: string;
  description: string;
  rentCents: number;
  depositCents: number;
  availableOn: string;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  propertyType: "house" | "townhouse" | "condo" | "apartment";
  petPolicy: string;
  leaseTerm: string;
  status: ListingStatus;
  photos: string[];
  updatedAt: string;
};

export type ListingPublication = {
  listingId: string;
  network: ListingNetworkId;
  status: PublicationStatus;
  externalId?: string | null;
  lastError?: string | null;
  publishedAt?: string | null;
};

export type ListingConnection = {
  network: ListingNetworkId;
  status: ConnectionStatus;
  feedToken: string;
  partnerId?: string | null;
  lastSyncedAt?: string | null;
};

export const listingNetworks: ListingNetwork[] = [
  {
    id: "zillow",
    name: "Zillow",
    sites: ["Zillow", "Trulia", "HotPads"],
    format: "zillow_xml",
    family: "zillow_group",
    onboarding: "Zillow Rental Network accepts approved XML or MITS feeds. HomeOps hosts the feed; Zillow must approve the integration before listings go live on their network.",
    docsUrl: "https://www.zillowgroup.com/developers/api/rentals/rentals-feed-integrations/",
    envPushUrl: "ZILLOW_RENTALS_PUSH_URL",
  },
  {
    id: "apartments",
    name: "Apartments.com",
    sites: ["Apartments.com"],
    format: "mits_xml",
    family: "costar",
    onboarding: "Apartments.com has no public listings API. PMS partners syndicate through an inbound feed after onboarding with CoStar.",
    applyEmail: "feeds@apartments.com",
    envPushUrl: "APARTMENTS_FEED_PUSH_URL",
  },
  {
    id: "rent",
    name: "Rent.com",
    sites: ["Rent.com"],
    format: "mits_xml",
    family: "costar",
    onboarding: "Rent.com is on the CoStar network with Apartments.com. The same HomeOps MITS feed can be pointed at Rent.com after partner onboarding.",
    applyEmail: "feeds@apartments.com",
    envPushUrl: "RENT_FEED_PUSH_URL",
  },
  {
    id: "realtor",
    name: "Realtor.com",
    sites: ["Realtor.com"],
    format: "mits_xml",
    family: "move",
    onboarding: "Realtor.com rental syndication is feed-based for approved property-management systems. HomeOps hosts the feed; they pull after they accept the partner request.",
    envPushUrl: "REALTOR_FEED_PUSH_URL",
  },
  {
    id: "zumper",
    name: "Zumper",
    sites: ["Zumper", "PadMapper"],
    format: "json",
    family: "zumper",
    onboarding: "Zumper partner feeds are JSON. Enable the HomeOps feed, then give Zumper the pull URL once you have a partner account.",
    envPushUrl: "ZUMPER_FEED_PUSH_URL",
  },
];

export function listingNetwork(id: string) {
  return listingNetworks.find((row) => row.id === id) || null;
}

export function xmlEscape(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function listingCanonical(listing: RentalListing) {
  return {
    id: listing.id,
    homeId: listing.homeId,
    address: {
      street: listing.address,
      city: listing.city,
      state: listing.state,
      postalCode: listing.postalCode,
    },
    headline: listing.headline,
    description: listing.description,
    rent: listing.rentCents / 100,
    deposit: listing.depositCents / 100,
    availableOn: listing.availableOn,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    squareFeet: listing.squareFeet,
    propertyType: listing.propertyType,
    petPolicy: listing.petPolicy,
    leaseTerm: listing.leaseTerm,
    photos: listing.photos,
    status: listing.status,
    updatedAt: listing.updatedAt,
  };
}

export function zillowXml(listings: RentalListing[]) {
  const items = listings.map((listing) => `    <listing>
      <id>${xmlEscape(listing.id)}</id>
      <propertyType>${xmlEscape(listing.propertyType.toUpperCase())}</propertyType>
      <street>${xmlEscape(listing.address)}</street>
      <city>${xmlEscape(listing.city)}</city>
      <state>${xmlEscape(listing.state)}</state>
      <zip>${xmlEscape(listing.postalCode)}</zip>
      <title>${xmlEscape(listing.headline)}</title>
      <description>${xmlEscape(listing.description)}</description>
      <price>${listing.rentCents / 100}</price>
      <deposit>${listing.depositCents / 100}</deposit>
      <bedrooms>${listing.bedrooms}</bedrooms>
      <bathrooms>${listing.bathrooms}</bathrooms>
      <squareFeet>${listing.squareFeet}</squareFeet>
      <availableOn>${xmlEscape(listing.availableOn)}</availableOn>
      <leaseTerm>${xmlEscape(listing.leaseTerm)}</leaseTerm>
      <petPolicy>${xmlEscape(listing.petPolicy)}</petPolicy>
      <lastUpdated>${xmlEscape(listing.updatedAt)}</lastUpdated>
    </listing>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<homeOpsZillowFeed version="1.0" generatedAt="${new Date().toISOString()}">
  <!-- HomeOps-hosted Zillow Rental Network feed. Go live only after Zillow Rentals Integrations approval. -->
${items || "  <!-- no published listings -->"}
</homeOpsZillowFeed>
`;
}

export function mitsXml(listings: RentalListing[], networkName: string) {
  const properties = listings.map((listing) => `    <Property>
      <PropertyID>
        <Identification IDValue="${xmlEscape(listing.id)}" IDType="HomeOps"/>
        <MarketingName>${xmlEscape(listing.headline)}</MarketingName>
      </PropertyID>
      <ILS_Identification ILS_IdentificationType="Apartment" RentalType="Unspecified">
        <Latitude>0</Latitude>
        <Longitude>0</Longitude>
      </ILS_Identification>
      <Information>
        <StructureType>${xmlEscape(listing.propertyType)}</StructureType>
        <UnitCount>1</UnitCount>
      </Information>
      <Address>
        <AddressLine1>${xmlEscape(listing.address)}</AddressLine1>
        <City>${xmlEscape(listing.city)}</City>
        <State>${xmlEscape(listing.state)}</State>
        <PostalCode>${xmlEscape(listing.postalCode)}</PostalCode>
        <Country>US</Country>
      </Address>
      <Floorplan>
        <Name>${xmlEscape(listing.headline)}</Name>
        <UnitCount>1</UnitCount>
        <Room>
          <Comment>${xmlEscape(listing.bedrooms)} bed / ${xmlEscape(listing.bathrooms)} bath</Comment>
        </Room>
        <SquareFeet Max="${listing.squareFeet}" Min="${listing.squareFeet}"/>
        <MarketRent Max="${listing.rentCents / 100}" Min="${listing.rentCents / 100}"/>
        <EffectiveRent Max="${listing.rentCents / 100}" Min="${listing.rentCents / 100}"/>
        <Deposit DepositType="Deposit">${listing.depositCents / 100}</Deposit>
      </Floorplan>
      <Amenity>
        <Description>${xmlEscape(listing.description)}</Description>
      </Amenity>
      <PetPolicy>
        <Comment>${xmlEscape(listing.petPolicy)}</Comment>
      </PetPolicy>
      <Availability>
        <VacateDate>${xmlEscape(listing.availableOn)}</VacateDate>
      </Availability>
    </Property>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<PhysicalProperty xmlns="http://mitsimplics.org/mits" generatedBy="HomeOps" network="${xmlEscape(networkName)}" generatedAt="${new Date().toISOString()}">
${properties || "  <!-- no published listings -->"}
</PhysicalProperty>
`;
}

export function jsonFeed(listings: RentalListing[], network: ListingNetwork) {
  return {
    generatedBy: "HomeOps",
    network: network.id,
    sites: network.sites,
    generatedAt: new Date().toISOString(),
    listings: listings.map(listingCanonical),
  };
}

export function renderFeed(network: ListingNetwork, listings: RentalListing[]) {
  if (network.format === "zillow_xml") return { contentType: "application/xml; charset=utf-8", body: zillowXml(listings) };
  if (network.format === "mits_xml") return { contentType: "application/xml; charset=utf-8", body: mitsXml(listings, network.name) };
  return { contentType: "application/json; charset=utf-8", body: JSON.stringify(jsonFeed(listings, network), null, 2) };
}

export function pushUrlFor(network: ListingNetwork) {
  const key = network.envPushUrl;
  if (!key) return null;
  const value = process.env[key]?.trim();
  return value || null;
}
