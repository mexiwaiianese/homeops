"use client";

import { useEffect, useState } from "react";
import ManagerOpsNav from "@/components/manager-ops-nav";
import { applicationStatusLabel, type RentalApplication } from "@/lib/applications";

const money = (cents: number | null) =>
  cents == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

export default function ApplicationsPage() {
  const [mode, setMode] = useState("checking");
  const [rows, setRows] = useState<RentalApplication[]>([]);
  const [screening, setScreening] = useState("manual");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState("clear");

  async function load() {
    const response = await fetch("/api/applications");
    const body = await response.json();
    if (!response.ok) { setMode("error"); return; }
    setMode(body.mode);
    setScreening(body.screening);
    setRows(body.applications || []);
    setSelectedId((current) => current && body.applications?.some((row: RentalApplication) => row.id === current) ? current : body.applications?.[0]?.id || null);
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 4000); return () => clearTimeout(timer); }, [toast]);

  const selected = rows.find((row) => row.id === selectedId) || null;
  useEffect(() => { setNotes(selected?.screeningNotes || ""); }, [selected?.id]);

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
    } else {
      setToast("Application updated.");
    }
    await load();
  }

  return (
    <main className="vendorShell">
      {toast && <div className="toast">{toast}</div>}
      <aside className="finSide">
        <ManagerOpsNav active="applications" />
        <div className="portfolio">
          <small>APPLICATIONS</small>
          <strong>{rows.length} on file</strong>
          <span>{screening === "provider" ? "Provider connected" : "Manual screening"}</span>
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
                  {selected.reasonForMove && <div className="jobLogRow"><strong>Move reason</strong><span>{selected.reasonForMove}</span></div>}
                </div>
                <div className="sectionTitle"><h3>Screening</h3></div>
                <p className="summary">{screening === "provider" ? "Request sends the application id to the configured provider. Results still get recorded here." : "No screening provider is configured. Record the result after you run the report outside portonOS."}</p>
                <div className="formGrid">
                  <label>Result
                    <select value={result} onChange={(event) => setResult(event.target.value)}>
                      <option value="requested">Requested</option>
                      <option value="clear">Clear</option>
                      <option value="review">Needs review</option>
                      <option value="fail">Fail</option>
                    </select>
                  </label>
                  <label className="span2">Notes<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Report id, conditions, or why you are asking for another document." /></label>
                </div>
                <div className="modalActions">
                  <button className="secondaryBtn" disabled={Boolean(busy)} onClick={() => void act("screening", { screeningStatus: result, notes })}>{busy === "screening" ? "Saving…" : "Save screening"}</button>
                  {selected.feeStatus === "unpaid" && <button className="secondaryBtn" disabled={Boolean(busy)} onClick={() => void act("waive")}>Waive fee</button>}
                  <button className="secondaryBtn" disabled={Boolean(busy) || selected.status === "leased"} onClick={() => void act("decide", { status: "denied", managerNotes: notes })}>Deny</button>
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
