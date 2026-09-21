import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { demoInviteToken, demoProspects, markDemoInvited } from "@/lib/vendor-prospect-demo";
import { inviteProspect } from "@/lib/vendor-invite";
import { invitationUrl } from "@/lib/vendor-outreach";
import { INDEPENDENT_INVITE_DEFAULTS, independentFitScore, isIndependentInviteCandidate, rankDiscoveredProviders, type RecruitmentTradeSlug } from "@/lib/vendor-prospects";
import { isNetworkAdmin } from "@/lib/vendors";

export async function POST(request: Request) {
  const { supabase, user, organizationId, role } = await getAuthedContext();
  if (supabase && !isNetworkAdmin(role)) return NextResponse.json({ error: "Network admin required" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const city = String(body.city || "Lehi").trim();
  const state = String(body.state || "UT").trim().toUpperCase().slice(0, 2);
  const minRating = Number(body.minRating ?? INDEPENDENT_INVITE_DEFAULTS.minRating);
  const minReviews = Number(body.minReviews ?? INDEPENDENT_INVITE_DEFAULTS.minReviews);
  const maxReviews = Number(body.maxReviews ?? INDEPENDENT_INVITE_DEFAULTS.maxReviews);
  const limitPerCategory = Math.min(8, Math.max(1, Number(body.limitPerCategory ?? 3)));
  const autoInvite = body.autoInvite !== false;
  const trades = Array.isArray(body.trades) ? body.trades as RecruitmentTradeSlug[] : undefined;
  const origin = new URL(request.url).origin;

  if (!supabase) {
    const ranked = rankDiscoveredProviders(demoProspects.filter((row) =>
      (!trades?.length || trades.includes(row.categorySlug)) &&
      isIndependentInviteCandidate({ name: row.name, rating: row.publicRating, reviewCount: row.reviewCount, minRating, minReviews, maxReviews })
    ));
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
      source: "demo_catalog",
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
      message: "Demo recruitment ranked public listings and generated registration links. Connect Supabase plus Places/email/SMS providers to send live invitations.",
    });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const discover = await fetch(new URL("/api/vendors/prospects", request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") || "" },
    body: JSON.stringify({ city, state, trades }),
  });
  const discovered = await discover.json();
  if (!discover.ok) return NextResponse.json({ error: discovered.error || "Discovery failed" }, { status: discover.status });

  const { data: prospects, error } = await supabase
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

  const { data: org } = await supabase.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  const invited = [];
  if (autoInvite) {
    for (const prospect of picked) {
      if (prospect.outreach_status === "invited") continue;
      const result = await inviteProspect({
        supabase,
        organizationId,
        organizationName: org?.name || "HomeOps",
        prospect,
        requestedChannel: "auto",
        userId: user.id,
        baseUrl: origin,
      });
      if (result.ok) invited.push({ name: prospect.name, category: prospect.category_name, inviteUrl: result.inviteUrl, channel: result.channel, delivered: result.delivered, deliveryError: result.deliveryError });
    }
  }

  return NextResponse.json({
    mode: "live",
    source: discovered.source,
    warning: discovered.warning,
    discovered: discovered.discovered,
    invited,
    publicReputationNote: "Independent-fit rank is recruitment-only. High-volume chains are skipped. This does not change dispatch eligibility or operational scorecards.",
  });
}
