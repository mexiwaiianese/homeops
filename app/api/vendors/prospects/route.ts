import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { demoProspects, demoProspectsWithOutreach } from "@/lib/vendor-prospect-demo";
import { discoverProvidersFromPlaces, groupDiscoveredProviders, independentFitScore, isIndependentInviteCandidate, prospectFingerprint, rankDiscoveredProviders, type RecruitmentTradeSlug } from "@/lib/vendor-prospects";
import { normalizeVendorName, isNetworkAdmin } from "@/lib/vendors";

function toRow(organizationId: string, provider: ReturnType<typeof rankDiscoveredProviders>[number], matchedVendorId: string | null, outreachStatus = "discovered") {
  return {
    organization_id: organizationId,
    source: provider.source,
    source_place_id: provider.sourcePlaceId,
    name: provider.name,
    normalized_name: normalizeVendorName(provider.name),
    identity_fingerprint: prospectFingerprint({
      name: provider.name,
      phone: provider.phone,
      email: provider.email,
      postalCode: provider.postalCode,
    }),
    category_slug: provider.categorySlug,
    category_name: provider.categoryName,
    phone: provider.phone,
    email: provider.email,
    website: provider.website,
    address1: provider.address1,
    city: provider.city,
    state: provider.state,
    postal_code: provider.postalCode,
    public_rating: provider.publicRating,
    review_count: provider.reviewCount,
    public_rank_score: provider.publicRankScore,
    editorial_summary: provider.editorialSummary,
    maps_url: provider.mapsUrl,
    vendor_id: matchedVendorId,
    outreach_status: outreachStatus,
    last_discovered_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function GET() {
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase) {
    const prospects = demoProspectsWithOutreach().map((row) => ({
      ...row,
      invite_eligible: isIndependentInviteCandidate({
        name: row.name,
        rating: row.publicRating,
        reviewCount: row.reviewCount,
      }),
    }));
    return NextResponse.json({
      mode: "demo",
      source: "demo_catalog",
      prospects,
      groups: groupDiscoveredProviders(prospects),
    });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { data, error } = await supabase
    .from("vendor_prospects")
    .select("*, vendor_invitations(id,channel,sent_to,sent_at,registered_at,token,active)")
    .eq("organization_id", organizationId)
    .order("public_rank_score", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const prospects = (data ?? []).map((row) => ({
    ...row,
    independent_fit_score: independentFitScore({
      name: row.name,
      rating: row.public_rating == null ? null : Number(row.public_rating),
      reviewCount: row.review_count,
      hasWebsite: Boolean(row.website),
    }),
    invite_eligible: isIndependentInviteCandidate({
      name: row.name,
      rating: row.public_rating == null ? null : Number(row.public_rating),
      reviewCount: row.review_count,
    }),
  })).sort((a, b) => b.independent_fit_score - a.independent_fit_score);
  return NextResponse.json({ mode: "live", prospects, groups: groupDiscoveredProviders(prospects.map((row) => ({
    source: row.source,
    sourcePlaceId: row.source_place_id,
    name: row.name,
    categorySlug: row.category_slug,
    categoryName: row.category_name,
    phone: row.phone,
    email: row.email,
    website: row.website,
    address1: row.address1,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    publicRating: row.public_rating == null ? null : Number(row.public_rating),
    reviewCount: row.review_count,
    publicRankScore: Number(row.public_rank_score),
    independentFitScore: independentFitScore({
      name: row.name,
      rating: row.public_rating == null ? null : Number(row.public_rating),
      reviewCount: row.review_count,
      hasWebsite: Boolean(row.website),
    }),
    mapsUrl: row.maps_url,
    editorialSummary: row.editorial_summary,
  }))) });
}

export async function POST(request: Request) {
  const { supabase, user, organizationId, role } = await getAuthedContext();
  const body = await request.json().catch(() => ({}));
  const city = String(body.city || "Lehi").trim();
  const state = String(body.state || "UT").trim().toUpperCase().slice(0, 2);
  const trades = Array.isArray(body.trades) ? body.trades as RecruitmentTradeSlug[] : undefined;

  if (!supabase) {
    const providers = rankDiscoveredProviders(demoProspects.filter((row) => !trades?.length || trades.includes(row.categorySlug)));
    return NextResponse.json({ mode: "demo", source: "demo_catalog", city, state, prospects: providers, groups: groupDiscoveredProviders(providers), discovered: providers.length });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!isNetworkAdmin(role)) return NextResponse.json({ error: "Network admin required" }, { status: 403 });

  const live = await discoverProvidersFromPlaces({ city, state, trades });
  const providers = live.source === "google_places" ? live.providers : rankDiscoveredProviders(demoProspects);
  const source = live.source === "google_places" ? "google_places" : "demo_catalog";

  const { data: vendors } = await supabase.from("vendors").select("id,identity_fingerprint,normalized_name").eq("organization_id", organizationId);
  const { data: existing } = await supabase.from("vendor_prospects").select("source,source_place_id,outreach_status,vendor_id").eq("organization_id", organizationId);
  const upserts = providers.map((provider) => {
    const fingerprint = prospectFingerprint({ name: provider.name, phone: provider.phone, email: provider.email, postalCode: provider.postalCode });
    const match = (vendors ?? []).find((vendor) => vendor.identity_fingerprint === fingerprint || vendor.normalized_name === normalizeVendorName(provider.name));
    const previous = (existing ?? []).find((row) => row.source === source && row.source_place_id === provider.sourcePlaceId);
    return toRow(organizationId, { ...provider, source }, previous?.vendor_id ?? match?.id ?? null, previous?.outreach_status || "discovered");
  });

  const { data, error } = await supabase.from("vendor_prospects").upsert(upserts, { onConflict: "organization_id,source,source_place_id" }).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await supabase.from("vendor_outreach_events").insert((data ?? []).map((row) => ({
    organization_id: organizationId,
    prospect_id: row.id,
    vendor_id: row.vendor_id,
    event_type: "discovered",
    notes: source,
  })));
  return NextResponse.json({
    mode: "live",
    source,
    warning: live.source === "unavailable" ? live.error : null,
    city,
    state,
    prospects: data ?? [],
    discovered: (data ?? []).length,
  });
}
