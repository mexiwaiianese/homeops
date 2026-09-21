"use client";

import { useEffect, useState } from "react";

const money = (cents?: number | null) =>
  cents == null ? "" : String(cents / 100);

export default function VendorBiddingPanel({ vendorId }: { vendorId: string }) {
  const [calendar, setCalendar] = useState<{ status?: string; provider?: string }>({ status: "disconnected" });
  const [rule, setRule] = useState({
    enabled: false,
    maxAmount: "",
    minAmount: "",
    undercut: "25",
    minNoticeHours: "4",
    jobDurationHours: "2",
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`/api/vendors/${vendorId}/calendar`).then((r) => r.json()),
      fetch(`/api/vendors/${vendorId}/autobid`).then((r) => r.json()),
    ]).then(([cal, auto]) => {
      setCalendar(cal.connection || { status: "disconnected" });
      const next = auto.rule || {};
      setRule({
        enabled: Boolean(next.enabled),
        maxAmount: money(next.maxAmountCents),
        minAmount: money(next.minAmountCents),
        undercut: next.undercutCents != null ? String(next.undercutCents / 100) : "25",
        minNoticeHours: String(next.minNoticeHours ?? 4),
        jobDurationHours: String(next.jobDurationHours ?? 2),
      });
    }).catch(() => setMessage("Could not load bidding settings"));
  }, [vendorId]);

  async function saveRule() {
    const response = await fetch(`/api/vendors/${vendorId}/autobid`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rule),
    });
    const body = await response.json();
    setMessage(response.ok ? "Autobid rules saved" : body.error || "Could not save autobid");
  }

  async function toggleCalendar(action: "connect" | "disconnect") {
    const response = await fetch(`/api/vendors/${vendorId}/calendar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await response.json();
    if (!response.ok) { setMessage(body.error || "Could not update calendar"); return; }
    setCalendar(body.connection);
    setMessage(action === "connect" ? "Service calendar connected. Autobid can now check availability." : "Calendar disconnected. Autobid is blocked.");
  }

  return (
    <>
      <div className="sectionTitle">
        <h3>Reverse auction & autobid</h3>
        <span>Calendar required for autobid</span>
      </div>
      <p className="summary">Eligible jobs notify this vendor by email or SMS. Manual bids are always allowed. Autobid only fires when a service calendar is connected and has an open slot for the manager’s needed-by time.</p>
      <div className="miniStats vendorMini">
        <div>
          <span>Calendar</span>
          <strong>{calendar.status === "connected" ? "Connected" : "Not connected"}</strong>
        </div>
        <div>
          <span>Autobid</span>
          <strong>{rule.enabled ? "On" : "Off"}</strong>
        </div>
      </div>
      <div className="vendorFilters">
        {calendar.status === "connected"
          ? <button className="secondaryBtn" onClick={() => void toggleCalendar("disconnect")}>Disconnect calendar</button>
          : <button className="primary" onClick={() => void toggleCalendar("connect")}>Connect service calendar</button>}
      </div>
      <div className="formGrid">
        <label className="checkRow">
          <input type="checkbox" checked={rule.enabled} onChange={(e) => setRule({ ...rule, enabled: e.target.checked })} />
          <span><strong>Enable autobid</strong><small>Blocked until a calendar is connected.</small></span>
        </label>
        <label>Max bid ($)<input type="number" value={rule.maxAmount} onChange={(e) => setRule({ ...rule, maxAmount: e.target.value })} /></label>
        <label>Floor bid ($)<input type="number" value={rule.minAmount} onChange={(e) => setRule({ ...rule, minAmount: e.target.value })} /></label>
        <label>Undercut ($)<input type="number" value={rule.undercut} onChange={(e) => setRule({ ...rule, undercut: e.target.value })} /></label>
        <label>Min notice (hours)<input type="number" value={rule.minNoticeHours} onChange={(e) => setRule({ ...rule, minNoticeHours: e.target.value })} /></label>
        <label>Job duration (hours)<input type="number" value={rule.jobDurationHours} onChange={(e) => setRule({ ...rule, jobDurationHours: e.target.value })} /></label>
      </div>
      <div className="modalActions">
        <button className="primary" onClick={() => void saveRule()}>Save autobid rules</button>
      </div>
      {message && <div className="notice">{message}</div>}
    </>
  );
}
