"use client";

import { useEffect, useState } from "react";
import ManagerOpsNav from "@/components/manager-ops-nav";
import { applicationStatusLabel, screeningStatusLabel, type RentalApplication } from "@/lib/applications";

const money = (cents: number | null) =>
  cents == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

function formatWhen(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

export default function ApplicationsPage() {
  const [mode, setMode] = useState("checking");
  const [rows, setRows] = useState<RentalApplication[]>([]);
  const [screening, setScreening] = useState("manual");
  const [screeningPayUrl, setScreeningPayUrl] = useState("");
  const [savedPayUrl, setSavedPayUrl] = useState("");
  const [payUrlDraft, setPayUrlDraft] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState("clear");
  const [denyOpen, setDenyOpen] = useState(false);

  async function load() {
    const response = await fetch("/api/applications");
    const body = await response.json();
    if (!response.ok) { setMode("error"); return; }
    setMode(body.mode);
    setScreening(body.screening);
    setScreeningPayUrl(body.screeningPayUrl || "");
    setSavedPayUrl(body.rentspreeApplicantPayUrl || "");
    setRows(body.applications || []);
    setSelectedId((current) => current && body.applications?.some((row: RentalApplication) => row.id === current) ? current : body.applications?.[0]?.id || null);
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 5000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { setPayUrlDraft(savedPayUrl); }, [savedPayUrl]);

  const selected = rows.find((row) => row.id === selectedId) || null;
  useEffect(() => { setNotes(selected?.screeningNotes || ""); setDenyOpen(false); }, [selected?.id]);
  useEffect(() => { if (screeningPayUrl && result === "requested") setResult("clear"); }, [screeningPayUrl, result]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (!selected) return;
    setBusy(action);
    const response = await fetch(`/api/applications/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const body = await response.json();
    setBusy("");
    if (!response.ok) { setToast(body.error || "Could not update the application."); return; }
    if (body.portal?.url) {
      try { await navigator.clipboard.writeText(body.portal.url); } catch { /* copy is optional */ }
      setToast(body.portal.delivered ? `Lease created. Portal link sent to ${body.portal.sentTo}.` : "Lease created. Portal link copied — email and SMS are not configured.");
    } else if (action === "request-screening") {
      setToast("Screening requested. RentSpree emails you when the applicant has paid. That email has their name and no report id.");
    } else {
      setToast("Application updated.");
    }
    await load();
  }

  async function copyPayLink() {
    if (!screeningPayUrl) return;
    try {
      await navigator.clipboard.writeText(screeningPayUrl);
      setToast("Applicant-pay link copied.");
    } catch {
      setToast(screeningPayUrl);
    }
  }

  async function savePayUrl() {
    setBusy("pay-url");
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rentspreeApplicantPayUrl: payUrlDraft.trim() }),
    });
    const body = await response.json();
    setBusy("");
    if (!response.ok) { setToast(body.error || "Could not save the screening link."); return; }
    setToast(body.settings?.rentspreeApplicantPayUrl ? "Screening link saved." : "Screening link cleared. Record the result on the manual form.");
    await load();
  }

  function startDeny() {
    if (!selected || selected.status === "leased") return;
    if (selected.screeningStatus !== "not_started") {
      setDenyOpen(true);
      return;
    }
    void act("decide", { status: "denied", managerNotes: notes });
  }

  return (
    <main className="vendorShell">
      {toast && <div className="toast">{toast}</div>}
      <aside className="finSide">
        <ManagerOpsNav active="applications" />
        <div className="portfolio">
          <small>APPLICATIONS</small>
          <strong>{rows.length} on file</strong>
          <span>{screening === "rentspree" ? "RentSpree applicant-pay" : screening === "provider" ? "Provider connected" : "Manual screening"}</span>
          <span className={"mode " + mode}>{mode === "live" ? "● Supabase live" : mode === "demo" ? "○ Demo mode" : "Checking…"}</span>
        </div>
      </aside>
      <section className="vendorContent">
        <header className="finHeader">
          <div>
            <p className="eyebrow">LEASING</p>
            <h1>Review applicants, then hand them a lease.</h1>
            <p>Each listing has a public apply link. Approving and creating the lease adds the tenant and emails or texts their portal sign-in link.</p>
          </div>
        </header>
        <section className="panel" style={{ marginTop: 16 }}>
          <div className="panelHead">
            <div>
              <p className="eyebrow">ORGANIZATION</p>
              <h2>RentSpree applicant-pay URL</h2>
            </div>
          </div>
          <p className="summary">Leave this empty and screening stays the manual result form. When it is set, the applicant pays RentSpree for the credit, criminal, and eviction report. portonOS is not charged, adds no markup, and does not take a card for that report. The listing application fee stays a separate fee.</p>
          {mode === "demo" && <p className="summary">Demo uses a stand-in link and never opens RentSpree.</p>}
          <div className="formGrid">
            <label className="span2">Applicant-pay URL
              <input value={payUrlDraft} onChange={(event) => setPayUrlDraft(event.target.value)} placeholder="Leave empty for manual screening" />
            </label>
          </div>
          <div className="modalActions">
            <button className="secondaryBtn" disabled={Boolean(busy)} onClick={() => void savePayUrl()}>{busy === "pay-url" ? "Saving…" : "Save screening link"}</button>
          </div>
        </section>
        <div className="listingLayout">
          <section className="panel">
            <div className="panelHead"><div><p className="eyebrow">INBOX</p><h2>Applicants</h2></div></div>
            <div className="taskList">
              {rows.map((row) => (
                <button key={row.id} className={selectedId === row.id ? "homeRow selected" : "homeRow"} onClick={() => setSelectedId(row.id)}>
                  <div>
                    <strong>{row.fullName}</strong>
                    <span>{row.address} · fee {row.feeStatus}</span>
                  </div>
                  <span className={`tag ${row.status === "approved" || row.status === "leased" ? "normal" : "high"}`}>{applicationStatusLabel(row.status)}</span>
                </button>
              ))}
              {!rows.length && <div className="empty">No applications yet. Copy an apply link from Listings.</div>}
            </div>
          </section>
          <section className="panel">
            {selected ? (
              <>
                <div className="panelHead">
                  <div>
                    <p className="eyebrow">{selected.headline}</p>
                    <h2>{selected.fullName}</h2>
                    <p>{selected.email}{selected.phone ? ` · ${selected.phone}` : ""} · household {selected.householdSize} · income {money(selected.monthlyIncomeCents)}</p>
                  </div>
                </div>
                <div className="jobLogList">
                  <div className="jobLogRow"><strong>Home</strong><span>{selected.address}</span></div>
                  <div className="jobLogRow"><strong>Move-in</strong><span>{selected.desiredMoveIn || "—"}</span></div>
                  <div className="jobLogRow"><strong>Current landlord</strong><span>{selected.landlordName || "—"} {selected.landlordPhone || ""}</span></div>
                  <div className="jobLogRow"><strong>Current rent</strong><span>{money(selected.currentRentCents)} · {selected.currentAddress || "no address"}</span></div>
                  <div className="jobLogRow"><strong>Work</strong><span>{[selected.jobTitle, selected.employer].filter(Boolean).join(" at ") || "—"}{selected.employmentLength ? ` · ${selected.employmentLength}` : ""}</span></div>
                  <div className="jobLogRow"><strong>Pets / vehicles</strong><span>{selected.pets || "None listed"} · {selected.vehicles || "No vehicle"}</span></div>
                  <div className="jobLogRow"><strong>Fee</strong><span>{money(selected.feeCents)} · {selected.feeStatus}</span></div>
                  <div className="jobLogRow"><strong>Occupants</strong><span>{selected.occupants.length ? selected.occupants.join(", ") : "—"}</span></div>
                  <div className="jobLogRow"><strong>Screening</strong><span>{screeningStatusLabel(selected.screeningStatus)}{selected.screeningProvider ? ` · ${selected.screeningProvider}` : ""}{selected.screeningRequestedAt ? ` · requested ${formatWhen(selected.screeningRequestedAt)}` : ""}</span></div>
                  {selected.reasonForMove && <div className="jobLogRow"><strong>Move reason</strong><span>{selected.reasonForMove}</span></div>}
                </div>
                <div className="sectionTitle"><h3>Screening</h3></div>
                {screeningPayUrl ? (
                  <>
                    <p className="summary">RentSpree will email you when {selected.fullName} has paid. That email has the applicant&apos;s name and no report id. Open RentSpree to read the report. Accept, deny, and the adverse-action notice are sent from the RentSpree dashboard.</p>
                    <p className="summary" style={{ overflowWrap: "anywhere" }}>Applicant-pay link: {screeningPayUrl}</p>
                    <div className="modalActions" style={{ flexWrap: "wrap" }}>
                      <button className="secondaryBtn" type="button" disabled={Boolean(busy)} onClick={() => void copyPayLink()}>Copy applicant-pay link</button>
                      <a className="secondaryBtn" href={screeningPayUrl} target="_blank" rel="noreferrer">Open applicant-pay link</a>
                      <button className="secondaryBtn" type="button" disabled={Boolean(busy)} onClick={() => void act("request-screening")}>{busy === "request-screening" ? "Requesting…" : "Request screening"}</button>
                    </div>
                    <p className="summary">After you read the report in RentSpree, record Clear, Needs review, or Fail, plus a note.</p>
                  </>
                ) : (
                  <p className="summary">{screening === "provider" ? "Request sends the application id to the configured provider. Results still get recorded here." : "No screening provider is configured. Record the result after you run the report outside portonOS."}</p>
                )}
                <div className="formGrid">
                  <label>Result
                    <select value={result} onChange={(event) => setResult(event.target.value)}>
                      {!screeningPayUrl && <option value="requested">Requested</option>}
                      <option value="clear">Clear</option>
                      <option value="review">Needs review</option>
                      <option value="fail">Fail</option>
                    </select>
                  </label>
                  <label className="span2">Notes<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={screeningPayUrl ? "What you saw after reading the report in RentSpree." : "Report id, conditions, or why you are asking for another document."} /></label>
                </div>
                {denyOpen && (
                  <div className="notice" role="dialog" aria-label="Deny application">
                    <p>The adverse-action notice is sent from the RentSpree dashboard, not from portonOS. portonOS will not email that notice. You can still deny the application here.</p>
                    <div className="modalActions">
                      <button className="secondaryBtn" type="button" onClick={() => setDenyOpen(false)}>Cancel</button>
                      <button className="secondaryBtn" type="button" disabled={Boolean(busy)} onClick={() => { setDenyOpen(false); void act("decide", { status: "denied", managerNotes: notes }); }}>Deny application</button>
                    </div>
                  </div>
                )}
                <div className="modalActions" style={{ flexWrap: "wrap" }}>
                  <button className="secondaryBtn" disabled={Boolean(busy)} onClick={() => void act("screening", { screeningStatus: result, notes })}>{busy === "screening" ? "Saving…" : "Save screening"}</button>
                  {selected.feeStatus === "unpaid" && <button className="secondaryBtn" disabled={Boolean(busy)} onClick={() => void act("waive")}>Waive fee</button>}
                  <button className="secondaryBtn" disabled={Boolean(busy) || selected.status === "leased"} onClick={startDeny}>Deny</button>
                  <button className="secondaryBtn" disabled={Boolean(busy) || selected.status === "leased"} onClick={() => void act("decide", { status: "approved", managerNotes: notes })}>Approve</button>
                  <button className="primary" disabled={Boolean(busy) || selected.status !== "approved"} onClick={() => void act("lease")}>{busy === "lease" ? "Creating…" : "Create tenant and draft lease"}</button>
                </div>
                {selected.tenantId && <p className="summary">Tenant {selected.tenantId.slice(0, 8)} · lease {selected.leaseId?.slice(0, 8)}</p>}
              </>
            ) : <div className="empty">Select an applicant.</div>}
          </section>
        </div>
      </section>
    </main>
  );
}
