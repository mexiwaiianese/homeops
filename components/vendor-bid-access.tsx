"use client";

import { useEffect, useState } from "react";

type AccessPayload = {
  successfulJobs: number;
  jobsRequired: number;
  access?: { scope?: string; summary?: string } | null;
  grants: Array<{ id: string; managerName: string; properties: string[] }>;
  managerProperties: string[];
};

export default function VendorBidAccess({ vendorId }: { vendorId: string }) {
  const [data, setData] = useState<AccessPayload | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    fetch(`/api/vendors/${vendorId}/bid-access`)
      .then((r) => r.json())
      .then((body) => { if (!body.error) setData(body); })
      .catch(() => setMessage("Could not load bidding access."));
  }

  useEffect(() => { load(); }, [vendorId]);

  async function update(action: "grant" | "revoke") {
    setBusy(true);
    const response = await fetch(`/api/vendors/${vendorId}/bid-access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not update bidding access."); return; }
    setData(body);
    setMessage(action === "grant" ? "This company can now bid on your properties only." : "Early bidding access removed.");
  }

  if (!data) return null;
  const unlocked = data.successfulJobs >= data.jobsRequired;
  return (
    <>
      <div className="sectionTitle">
        <h3>Bidding access</h3>
        <span>{unlocked ? `${data.successfulJobs} successful jobs` : `${data.successfulJobs} of ${data.jobsRequired} successful jobs`}</span>
      </div>
      <p className="summary">{data.access?.summary}</p>
      {unlocked ? (
        <div className="notice">This company has completed enough jobs to bid and autobid across the network, still inside the guardrails they set on their own desk.</div>
      ) : data.grants.length ? (
        <div className="notice">
          Allowed only on {data.grants.map((grant) => grant.properties.join(", ")).join("; ") || "the properties you selected"}. They cannot bid outside this property set until they reach {data.jobsRequired} successful jobs.
        </div>
      ) : (
        <div className="notice">Autobid and bidding stay off until they finish {data.jobsRequired} successful jobs, unless you allow them onto your properties.</div>
      )}
      {!unlocked && (
        <div className="vendorFilters">
          {data.grants.length ? (
            <button className="secondaryBtn" disabled={busy} onClick={() => void update("revoke")}>Remove early access</button>
          ) : (
            <button className="primary" disabled={busy} onClick={() => void update("grant")}>Allow bidding on my properties</button>
          )}
        </div>
      )}
      {!unlocked && !data.grants.length && (
        <p className="summary">Allowing them covers this property set: {data.managerProperties.join(", ") || "no properties on file"}.</p>
      )}
      {message && <div className="notice">{message}</div>}
    </>
  );
}
