"use client";

import { useEffect, useState } from "react";

const money = (cents?: number | null) =>
  cents == null
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

type Invite = {
  vendorId?: string;
  vendor_id?: string;
  vendorName?: string;
  token?: string;
  bidUrl?: string;
  sentTo?: string | null;
  sent_to?: string | null;
  deliveryError?: string | null;
  delivery_error?: string | null;
  vendors?: { name?: string };
};

type Bid = {
  vendorId: string;
  vendorName?: string;
  amountCents: number;
  source: string;
  status: string;
};

export default function AuctionBoard({
  requestId,
  title,
  onClose,
  onAwarded,
}: {
  requestId: string;
  title: string;
  onClose: () => void;
  onAwarded: (vendor: { id: string; name: string }) => void;
}) {
  const [payload, setPayload] = useState<any>(null);
  const [message, setMessage] = useState("Loading auction…");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch(`/api/maintenance/${requestId}/auction`);
    const body = await response.json();
    if (!response.ok) { setMessage(body.error || "Could not load auction"); return; }
    setPayload(body);
    setMessage("");
  }

  useEffect(() => { void load(); const timer = setInterval(() => void load(), 8000); return () => clearInterval(timer); }, [requestId]);

  async function award(vendorId: string) {
    setBusy(true);
    const response = await fetch(`/api/maintenance/${requestId}/auction/award`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorId }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not award bid"); return; }
    onAwarded({ id: body.vendor.id, name: body.vendor.name });
  }

  const opportunity = payload?.opportunity;
  const bids: Bid[] = payload?.mode === "demo"
    ? (opportunity?.bids || [])
    : (payload?.bids || []);
  const invites: Invite[] = opportunity?.invites || opportunity?.vendor_bid_invites || [];

  return (
    <div className="modalShade" onMouseDown={onClose}>
      <section className="modal vendorEditor" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <p className="eyebrow">REVERSE AUCTION</p>
            <h2>{title}</h2>
            <p>Eligible approved vendors only. Lowest bid leads; you still choose who to award.</p>
          </div>
          <button className="closeBtn" onClick={onClose}>×</button>
        </div>
        {message && <div className="notice">{message}</div>}
        {opportunity && (
          <div className="miniStats vendorMini">
            <div><span>Status</span><strong>{opportunity.status}</strong></div>
            <div><span>Budget</span><strong>{money(opportunity.budgetCents ?? opportunity.budget_cents)}</strong></div>
            <div><span>Needed by</span><strong>{opportunity.neededBy || opportunity.needed_by ? new Date(opportunity.neededBy || opportunity.needed_by).toLocaleString() : "—"}</strong></div>
            <div><span>Leading</span><strong>{money(payload?.leading?.amountCents ?? payload?.leading?.amount_cents)}</strong></div>
          </div>
        )}
        <div className="sectionTitle"><h3>Bids</h3><span>{bids.filter((bid) => bid.status === "active" || bid.status === "awarded").length} in</span></div>
        <div className="credentialList">
          {bids.length ? bids.map((bid) => (
            <div className="credential" key={bid.vendorId}>
              <div>
                <strong>{bid.vendorName || bid.vendorId}</strong>
                <span>{money(bid.amountCents)} · {bid.source} · {bid.status}</span>
              </div>
              {opportunity?.status === "open" && bid.status === "active" && (
                <button className="primary" disabled={busy} onClick={() => void award(bid.vendorId)}>Award</button>
              )}
            </div>
          )) : <div className="empty">No bids yet. Autobid only fires when a vendor’s calendar is connected and the timeline is open.</div>}
        </div>
        <div className="sectionTitle"><h3>Invited vendors</h3></div>
        <div className="credentialList">
          {invites.map((invite) => (
            <div className="credential" key={invite.token || invite.vendorId || invite.vendor_id}>
              <div>
                <strong>{invite.vendors?.name || invite.vendorName || invite.vendorId || invite.vendor_id}</strong>
                <span>{invite.sentTo || invite.sent_to || "No contact on file"}{(invite.deliveryError || invite.delivery_error) ? ` · ${invite.deliveryError || invite.delivery_error}` : ""}</span>
              </div>
              {(invite.bidUrl || invite.token) && (
                <a className="textBtn" href={invite.bidUrl || `/vendors/bid/${invite.token}`} target="_blank" rel="noreferrer">Open bid link</a>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
