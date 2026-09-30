"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { citiesForState, countiesForState } from "@/lib/area-zips";
import { US_STATES } from "@/lib/us-states";
import { independentFitScore, inviteSkipReason, isScaledBrand, parseOtherProviderTypes, RECRUITMENT_TRADES, type RecruitmentTradeSlug } from "@/lib/vendor-prospects";
import type { CatalogIntakeReview, CatalogMatch } from "@/lib/catalog-intake";

const OTHER_CITY = "__other__";
const ALL_TRADE_SLUGS = RECRUITMENT_TRADES.map((trade) => trade.slug);

type Prospect = {
  id?: string;
  sourcePlaceId?: string;
  source_place_id?: string;
  name: string;
  category_name?: string;
  categoryName?: string;
  category_slug?: string;
  public_rating?: number | null;
  publicRating?: number | null;
  review_count?: number;
  reviewCount?: number;
  public_rank_score?: number;
  publicRankScore?: number;
  independentFitScore?: number;
  independent_fit_score?: number;
  invite_eligible?: boolean;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  city?: string | null;
  outreach_status?: string;
  vendor_invitations?: Array<{ registered_at?: string | null; sent_at?: string | null; token?: string }>;
};

function ratingOf(row: Prospect) {
  return row.public_rating ?? row.publicRating ?? null;
}

function reviewsOf(row: Prospect) {
  return row.review_count ?? row.reviewCount ?? 0;
}

function fitOf(row: Prospect) {
  return row.independent_fit_score ?? row.independentFitScore ?? independentFitScore({
    name: row.name,
    rating: ratingOf(row),
    reviewCount: reviewsOf(row),
    hasWebsite: Boolean(row.website),
  });
}

export default function RecruitmentBoard() {
  const [state, setState] = useState("UT");
  const [areaMode, setAreaMode] = useState<"city" | "county">("city");
  const [cityChoice, setCityChoice] = useState("Lehi");
  const [otherCity, setOtherCity] = useState("");
  const [county, setCounty] = useState("Utah County");
  const [trades, setTrades] = useState<RecruitmentTradeSlug[]>([...ALL_TRADE_SLUGS]);
  const [otherTypeOn, setOtherTypeOn] = useState(false);
  const [otherTypes, setOtherTypes] = useState("");
  const [typesOpen, setTypesOpen] = useState(false);
  const typesRef = useRef<HTMLDivElement>(null);
  const cities = useMemo(() => citiesForState(state), [state]);
  const counties = useMemo(() => countiesForState(state), [state]);
  const city = areaMode === "city" ? (cityChoice === OTHER_CITY ? otherCity.trim() : cityChoice) : "";
  const selectedCounty = areaMode === "county" ? county : "";
  const extraQueries = useMemo(() => (otherTypeOn ? parseOtherProviderTypes(otherTypes) : []), [otherTypeOn, otherTypes]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [reviews, setReviews] = useState<CatalogIntakeReview[]>([]);
  const [mergePick, setMergePick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [source, setSource] = useState("");

  const load = useCallback(async () => {
    const [prospectRes, reviewRes] = await Promise.all([
      fetch("/api/vendors/prospects"),
      fetch("/api/vendors/catalog-reviews"),
    ]);
    const body = await prospectRes.json();
    if (!prospectRes.ok) { setMessage(body.error || "Could not load prospects"); return; }
    setProspects(body.prospects || []);
    setSource(body.source || body.mode || "");
    if (reviewRes.ok) {
      const reviewBody = await reviewRes.json();
      setReviews(reviewBody.reviews || []);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (cityChoice !== OTHER_CITY && !cities.includes(cityChoice)) {
      setCityChoice(cities[0] || OTHER_CITY);
    }
  }, [cities, cityChoice]);
  useEffect(() => {
    if (county && !counties.includes(county)) {
      setCounty(counties[0] || "");
    }
    if (areaMode === "county" && !counties.length) setAreaMode("city");
  }, [counties, county, areaMode]);
  useEffect(() => {
    function close(event: MouseEvent) {
      if (typesRef.current && !typesRef.current.contains(event.target as Node)) setTypesOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pendingReviews = useMemo(() => reviews.filter((row) => row.status === "pending"), [reviews]);

  const groupedProspects = useMemo(() => {
    const groups = new Map<string, Prospect[]>();
    for (const row of [...prospects].sort((a, b) => fitOf(b) - fitOf(a))) {
      const key = row.category_name || row.categoryName || "Other";
      groups.set(key, [...(groups.get(key) || []), row]);
    }
    return [...groups.entries()];
  }, [prospects]);

  function toggleTrade(slug: RecruitmentTradeSlug) {
    setTrades((current) => current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]);
  }

  async function run(autoInvite: boolean) {
    if (areaMode === "city" && !city) {
      setMessage("Choose a city, or pick Other and enter the city name.");
      return;
    }
    if (areaMode === "county" && !selectedCounty) {
      setMessage("Choose a county, or switch Search by to City.");
      return;
    }
    if (!trades.length && !extraQueries.length) {
      setMessage("Select at least one provider type, or enter an Other type.");
      return;
    }
    if (otherTypeOn && !extraQueries.length) {
      setMessage("Enter an Other provider type, or uncheck Other.");
      return;
    }
    setBusy(true);
    setMessage("");
    const place = selectedCounty || city;
    const response = await fetch("/api/vendors/recruitment/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        city: selectedCounty ? "" : city,
        county: selectedCounty,
        state,
        trades,
        extraQueries,
        autoInvite,
        minRating: 4.4,
        minReviews: 8,
        maxReviews: 250,
        limitPerCategory: 3,
      }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(body.error || "Recruitment failed"); return; }
    setSource(body.source);
    const zips = Array.isArray(body.zips) && body.zips.length ? ` ZIPs ${body.zips.join(", ")}.` : "";
    const queries = Array.isArray(body.queries) && body.queries.length ? ` Queries: ${body.queries.join("; ")}.` : "";
    setMessage(`${body.discovered || 0} independents ranked for ${body.place || place}, ${state}.${zips}${queries} ${body.invited?.length || 0} invitations prepared${body.warning ? ` • ${body.warning}` : ""}.`);
    await load();
  }

  async function invite(row: Prospect) {
    const id = row.id || row.sourcePlaceId || row.source_place_id;
    if (!id) return;
    setBusy(true);
    const response = await fetch(`/api/vendors/prospects/${id}/invite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not invite"); return; }
    setMessage(body.delivered ? `Invitation sent to ${body.sentTo}` : `Registration link ready: ${body.inviteUrl}`);
    await load();
  }

  async function resolveReview(id: string, action: "merge" | "authorize") {
    setBusy(true);
    const catalogVendorId = mergePick[id];
    const response = await fetch(`/api/vendors/catalog-reviews/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, catalogVendorId }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not resolve candidate"); return; }
    setMessage(action === "merge" ? "Merged with the catalog vendor." : "Authorized a new catalog vendor for invitation and screening.");
    await load();
  }

  return (
    <div className="recruitLayout">
      <section className="panel">
        <div className="panelHead">
          <div>
            <p className="eyebrow">PUBLIC RECRUITMENT</p>
            <h2>Find, rank, and invite home-service providers</h2>
          </div>
          <span className="pill">Independents first</span>
        </div>
        <p className="summary">Search by city or by county—not both. Discover maps that area to ZIP codes and builds a query per provider type, including any Other type you enter. Ranking still skips franchises and never writes public-review scores onto dispatch scorecards.</p>
        <div className="recruitFilters">
          <label>
            State
            <select value={state} onChange={(e) => setState(e.target.value)}>
              {US_STATES.map((row) => (
                <option key={row.code} value={row.code}>{row.name}</option>
              ))}
            </select>
          </label>
          <label>
            Search by
            <select
              value={areaMode}
              onChange={(e) => {
                const next = e.target.value === "county" ? "county" : "city";
                setAreaMode(next);
                if (next === "county" && !county) setCounty(counties[0] || "");
              }}
            >
              <option value="city">City</option>
              <option value="county" disabled={!counties.length}>County</option>
            </select>
          </label>
          {areaMode === "city" ? (
            <label className="span2">
              City
              <select value={cityChoice} onChange={(e) => setCityChoice(e.target.value)}>
                {cities.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
                <option value={OTHER_CITY}>Other…</option>
              </select>
            </label>
          ) : (
            <label className="span2">
              County
              <select value={county} onChange={(e) => setCounty(e.target.value)}>
                {counties.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
          )}
          {areaMode === "city" && cityChoice === OTHER_CITY && (
            <label className="span2">
              City name
              <input value={otherCity} onChange={(e) => setOtherCity(e.target.value)} placeholder="City name" />
            </label>
          )}
          <div className="span2 multiSelect" ref={typesRef}>
            <span>Provider types</span>
            <button type="button" className="multiSelectToggle" disabled={busy} onClick={() => setTypesOpen((open) => !open)}>
              {trades.length === ALL_TRADE_SLUGS.length && !otherTypeOn
                ? "All listed types"
                : `${trades.length} type${trades.length === 1 ? "" : "s"}${otherTypeOn ? " + Other" : ""}`}
            </button>
            {typesOpen && (
              <div className="multiSelectMenu">
                {RECRUITMENT_TRADES.map((trade) => (
                  <label key={trade.slug}>
                    <input
                      type="checkbox"
                      checked={trades.includes(trade.slug)}
                      onChange={() => toggleTrade(trade.slug)}
                    />
                    {trade.name}
                  </label>
                ))}
                <label>
                  <input
                    type="checkbox"
                    checked={otherTypeOn}
                    onChange={(e) => setOtherTypeOn(e.target.checked)}
                  />
                  Other
                </label>
              </div>
            )}
          </div>
          {otherTypeOn && (
            <label className="span2">
              Other provider type
              <input
                value={otherTypes}
                onChange={(e) => setOtherTypes(e.target.value)}
                placeholder="Garage door, painting, concrete…"
              />
            </label>
          )}
          <div className="span2 recruitActions">
            <button className="secondaryBtn" disabled={busy} onClick={() => void run(false)}>Discover & rank</button>
            <button className="primary" disabled={busy} onClick={() => void run(true)}>{busy ? "Working…" : "Find and invite"}</button>
          </div>
        </div>
        {message && <div className="notice">{message}{source ? ` • Source: ${source}` : ""}</div>}
        {prospects.length === 0 && !message && (
          <div className="empty">No prospects on the board yet. Discover & rank maps the selected city or county to ZIP codes and ranks independents in that area. Find and invite also sends outreach — do not use it until you want emails or texts to go out.</div>
        )}
        {groupedProspects.map(([category, rows]) => (
          <div className="recruitGroup" key={category}>
            <h3>{category}</h3>
            <div className="recruitTable">
              <div className="recruitHead">
                <span>Provider</span>
                <span>Category</span>
                <span>Independent fit</span>
                <span>Contact</span>
                <span>Status</span>
                <span></span>
              </div>
              {rows.map((row) => {
                const registered = row.outreach_status === "registered" || row.vendor_invitations?.some((invite) => invite.registered_at);
                const invited = row.outreach_status === "invited" || Boolean(row.vendor_invitations?.length);
                const scaled = isScaledBrand(row.name);
                const skip = inviteSkipReason({ name: row.name, rating: ratingOf(row), reviewCount: reviewsOf(row) });
                return (
                  <div className={`recruitRow${scaled ? " isScaled" : ""}`} key={row.id || row.sourcePlaceId || row.name}>
                    <span data-label="Provider">
                      <strong>{row.name}</strong>
                      <small>{row.city || ""} {row.website ? "• website on file" : ""}</small>
                    </span>
                    <span data-label="Category">{row.category_name || row.categoryName}</span>
                    <span data-label="Independent fit">
                      <strong>{scaled ? "Skipped" : fitOf(row)}</strong>
                      <small>{ratingOf(row) ?? "—"} · {reviewsOf(row)} reviews{skip ? ` • ${skip}` : ""}</small>
                    </span>
                    <span data-label="Contact"><small>{row.email || row.phone || "No contact yet"}</small></span>
                    <span data-label="Status" className={registered ? "vendorStatus approved" : invited ? "vendorStatus conditional" : skip ? "vendorStatus skipped" : "vendorStatus"}>{registered ? "Registered" : invited ? "Invited" : skip || "Independent"}</span>
                    <span data-label="">
                      {registered ? <b className="goodText">Confirmed</b> : scaled ? <small>Not invited</small> : <button className="secondaryBtn" disabled={busy} onClick={() => void invite(row)}>Invite</button>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>
      <aside className="panel recruitSide">
        <div className="panelHead">
          <div>
            <p className="eyebrow">ORG CANDIDATES</p>
            <h2>Merge or authorize</h2>
          </div>
          <span className="pill">{pendingReviews.length} pending</span>
        </div>
        <p className="summary">Owners add candidates in their org. Matches against the platform catalog land here so you can merge a duplicate or authorize a new catalog vendor for invitation and screening.</p>
        {pendingReviews.length === 0 ? (
          <div className="empty">No org candidates waiting.</div>
        ) : pendingReviews.map((row) => {
          const vendorMatches = row.matches.filter((match) => match.kind === "vendor");
          const selected = mergePick[row.id] || vendorMatches[0]?.id || "";
          return (
            <div className="intakeCardMini" key={row.id}>
              <strong>{row.name}</strong>
              <small>{[row.trade, row.city, row.state].filter(Boolean).join(" • ") || "No trade/city"}</small>
              <small>{row.organization_name ? `From ${row.organization_name}` : "Organization candidate"}</small>
              {row.matches.length ? (
                <ul className="intakeMatches">
                  {row.matches.map((match: CatalogMatch) => (
                    <li key={`${match.kind}-${match.id}`}>
                      <label>
                        {match.kind === "vendor" && (
                          <input
                            type="radio"
                            name={`merge-${row.id}`}
                            checked={selected === match.id}
                            onChange={() => setMergePick((current) => ({ ...current, [row.id]: match.id }))}
                          />
                        )}
                        <span>
                          <b>{match.name}</b>
                          <em>{match.kind} • {match.reasons.join(", ")}</em>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="intakeNone">No catalog match. Authorize a new catalog vendor to invite and screen.</p>
              )}
              <div className="intakeActions">
                <button className="secondaryBtn" disabled={busy || !vendorMatches.length} onClick={() => void resolveReview(row.id, "merge")}>Merge duplicate</button>
                <button className="primary" disabled={busy} onClick={() => void resolveReview(row.id, "authorize")}>Authorize catalog vendor</button>
              </div>
            </div>
          );
        })}
      </aside>
    </div>
  );
}
