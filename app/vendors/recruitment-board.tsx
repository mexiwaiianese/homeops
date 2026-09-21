"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { independentFitScore, inviteSkipReason, isScaledBrand } from "@/lib/vendor-prospects";

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
  const [city, setCity] = useState("Lehi");
  const [state, setState] = useState("UT");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [source, setSource] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/vendors/prospects");
    const body = await response.json();
    if (!response.ok) { setMessage(body.error || "Could not load prospects"); return; }
    setProspects(body.prospects || []);
    setSource(body.source || body.mode || "");
  }, []);

  useEffect(() => { void load(); }, [load]);

  const groupedProspects = useMemo(() => {
    const groups = new Map<string, Prospect[]>();
    for (const row of [...prospects].sort((a, b) => fitOf(b) - fitOf(a))) {
      const key = row.category_name || row.categoryName || "Other";
      groups.set(key, [...(groups.get(key) || []), row]);
    }
    return [...groups.entries()];
  }, [prospects]);

  async function run(autoInvite: boolean) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/vendors/recruitment/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city, state, autoInvite, minRating: 4.4, minReviews: 8, maxReviews: 250, limitPerCategory: 3 }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(body.error || "Recruitment failed"); return; }
    setSource(body.source);
    setMessage(`${body.discovered || 0} independents ranked from public listings. ${body.invited?.length || 0} invitations prepared${body.warning ? ` • ${body.warning}` : ""}.`);
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

  return (
    <section className="panel">
      <div className="panelHead">
        <div>
          <p className="eyebrow">PUBLIC RECRUITMENT</p>
          <h2>Find, rank, and invite home-service providers</h2>
        </div>
        <span className="pill">Independents first</span>
      </div>
      <p className="summary">HomeOps looks for owner-operators with real public proof—not national brands or 1,000-review call centers. Invite ranking peaks around 25–90 reviews, skips franchises, and never writes that score onto dispatch scorecards.</p>
      <div className="vendorFilters">
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
        <input value={state} onChange={(e) => setState(e.target.value)} placeholder="ST" />
        <button className="secondaryBtn" disabled={busy} onClick={() => void run(false)}>Discover & rank</button>
        <button className="primary" disabled={busy} onClick={() => void run(true)}>{busy ? "Working…" : "Find and invite"}</button>
      </div>
      {message && <div className="notice">{message}{source ? ` • Source: ${source}` : ""}</div>}
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
                  <span>
                    <strong>{row.name}</strong>
                    <small>{row.city || ""} {row.website ? "• website on file" : ""}</small>
                  </span>
                  <span>{row.category_name || row.categoryName}</span>
                  <span>
                    <strong>{scaled ? "Skipped" : fitOf(row)}</strong>
                    <small>{ratingOf(row) ?? "—"} · {reviewsOf(row)} reviews{skip ? ` • ${skip}` : ""}</small>
                  </span>
                  <span><small>{row.email || row.phone || "No contact yet"}</small></span>
                  <span className={registered ? "vendorStatus approved" : invited ? "vendorStatus conditional" : skip ? "vendorStatus skipped" : "vendorStatus"}>{registered ? "Registered" : invited ? "Invited" : skip || "Independent"}</span>
                  <span>
                    {registered ? <b className="goodText">Confirmed</b> : scaled ? <small>Not invited</small> : <button className="secondaryBtn" disabled={busy} onClick={() => void invite(row)}>Invite</button>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
