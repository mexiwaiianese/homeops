import { NextResponse } from "next/server";
import { demoInviteToken, demoProspects, markDemoInvited } from "@/lib/vendor-prospect-demo";
import { inviteProspect } from "@/lib/vendor-invite";
import { invitationUrl } from "@/lib/vendor-outreach";
import { INDEPENDENT_INVITE_DEFAULTS, discoverProvidersForArea, independentFitScore, isIndependentInviteCandidate, parseOtherProviderTypes, type RecruitmentTradeSlug } from "@/lib/vendor-prospects";
import { requirePlatformAdmin } from "@/lib/operator-admin";
import { getPlatformCatalog } from "@/lib/platform-catalog";

export async function POST(request: Request) {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return admin.response;
  const catalog = await getPlatformCatalog();
  const body = await request.json().catch(() => ({}));
  const state = String(body.state || "UT").trim().toUpperCase().slice(0, 2);
  const county = String(body.county || "").trim();
  const city = county ? "" : String(body.city || "Lehi").trim();
  const minRating = Number(body.minRating ?? INDEPENDENT_INVITE_DEFAULTS.minRating);
  const minReviews = Number(body.minReviews ?? INDEPENDENT_INVITE_DEFAULTS.minReviews);
  const maxReviews = Number(body.maxReviews ?? INDEPENDENT_INVITE_DEFAULTS.maxReviews);
  const limitPerCategory = Math.min(8, Math.max(1, Number(body.limitPerCategory ?? 3)));
  const autoInvite = body.autoInvite !== false;
  const trades = Array.isArray(body.trades) ? body.trades as RecruitmentTradeSlug[] : undefined;
  const extraQueries = parseOtherProviderTypes(body.extraQueries ?? body.otherTypes);
  const origin = new URL(request.url).origin;

  if (!catalog.ok) {
    const area = await discoverProvidersForArea({ city, county, state, trades, extraQueries, catalog: demoProspects });
    const ranked = area.providers.filter((row) =>
      isIndependentInviteCandidate({ name: row.name, rating: row.publicRating, reviewCount: row.reviewCount, minRating, minReviews, maxReviews })
    );
    const picked: typeof ranked = [];
    const perCategory = new Map<string, number>();
    if (autoInvite) {
      for (const row of ranked.filter((item) => item.email || item.phone)) {
        const used = perCategory.get(row.categorySlug) ?? 0;
        if (used >= limitPerCategory) continue;
        picked.push(row);
        perCategory.set(row.categorySlug, used + 1);
      }
    }
    return NextResponse.json({
      mode: "demo",
      source: area.source,
      city: area.city,
      county: area.county,
      place: area.place,
      state,
      zips: area.zips,
      queries: area.queries,
      warning: area.warning,
      discovered: ranked.length,
      invited: picked.map((row) => {
        const inviteUrl = invitationUrl(demoInviteToken(row.sourcePlaceId), origin);
        markDemoInvited(row.sourcePlaceId, inviteUrl);
        return {
          name: row.name,
          category: row.categoryName,
          inviteUrl,
          channel: row.email ? "email" : "sms",
          delivered: false,
        };
      }),
      message: "Ranked independents for the ZIP codes of this city or county. Connect email/SMS to send live invitations.",
    });
  }

  const { admin: db, organizationId } = catalog;
  const discover = await fetch(new URL("/api/vendors/prospects", request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") || "" },
    body: JSON.stringify({ city, county, state, trades, extraQueries }),
  });
  const discovered = await discover.json();
  if (!discover.ok) return NextResponse.json({ error: discovered.error || "Discovery failed" }, { status: discover.status });

  const { data: prospects, error } = await db
    .from("vendor_prospects")
    .select("*")
    .eq("organization_id", organizationId)
    .in("outreach_status", ["discovered", "invited"]);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const eligible = (prospects ?? [])
    .filter((row) => isIndependentInviteCandidate({
      name: row.name,
      rating: row.public_rating == null ? null : Number(row.public_rating),
      reviewCount: Number(row.review_count ?? 0),
      minRating,
      minReviews,
      maxReviews,
    }) && (row.email || row.phone) && row.outreach_status !== "registered")
    .sort((a, b) => independentFitScore({
      name: b.name,
      rating: b.public_rating == null ? null : Number(b.public_rating),
      reviewCount: Number(b.review_count ?? 0),
      hasWebsite: Boolean(b.website),
    }) - independentFitScore({
      name: a.name,
      rating: a.public_rating == null ? null : Number(a.public_rating),
      reviewCount: Number(a.review_count ?? 0),
      hasWebsite: Boolean(a.website),
    }));

  const picked: typeof eligible = [];
  const perCategory = new Map<string, number>();
  for (const row of eligible) {
    const used = perCategory.get(row.category_slug) ?? 0;
    if (used >= limitPerCategory) continue;
    if (row.vendor_id && row.outreach_status === "invited") continue;
    picked.push(row);
    perCategory.set(row.category_slug, used + 1);
  }

  const invited = [];
  if (autoInvite) {
    for (const prospect of picked) {
      if (prospect.outreach_status === "invited") continue;
      const result = await inviteProspect({
        supabase: db,
        organizationId,
        organizationName: "portonOS",
        prospect,
        requestedChannel: "auto",
        userId: admin.user?.id ?? null,
        baseUrl: origin,
      });
      if (result.ok) invited.push({ name: prospect.name, category: prospect.category_name, inviteUrl: result.inviteUrl, channel: result.channel, delivered: result.delivered, deliveryError: result.deliveryError });
    }
  }

  return NextResponse.json({
    mode: "live",
    source: discovered.source,
    warning: discovered.warning,
    city: discovered.city,
    county: discovered.county,
    place: discovered.place,
    state,
    zips: discovered.zips,
    queries: discovered.queries,
    discovered: discovered.discovered,
    invited,
    publicReputationNote: "Independent-fit rank is recruitment-only. High-volume chains are skipped. This does not change dispatch eligibility or operational scorecards.",
  });
}
