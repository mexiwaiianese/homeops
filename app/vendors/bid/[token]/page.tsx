"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import BrandLockup from "@/components/brand-lockup";

type BidPage = {
  organizationName: string;
  vendorName: string;
  title: string;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  budgetCents: number | null;
  neededBy: string | null;
  endsAt: string;
  status: string;
  outcome: "open" | "won" | "lost" | "cancelled" | "expired" | "closed";
  leadingCents: number | null;
  bidCount: number;
  ownBid?: { amountCents: number; source: string; status?: string } | null;
  calendarConnected: boolean;
  autobid?: { enabled?: boolean } | null;
  autobidBlocked: string | null;
  fieldUrl?: string | null;
  error?: string;
};

const money = (cents: number | null) =>
  cents == null ? "No bids yet" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

function outcomeCopy(page: BidPage) {
  const amount = page.ownBid ? money(page.ownBid.amountCents) : money(page.leadingCents);
  if (page.outcome === "won") {
    return {
      kind: "won" as const,
      eyebrow: "You won",
      title: "This job was awarded to you",
      body: `${page.organizationName} awarded ${page.title} to ${page.vendorName}${amount !== "No bids yet" ? ` at ${amount}` : ""}. Open the job site to record arrival, work, and departure. Crews can use that link without signing in.`,
    };
  }
  if (page.outcome === "lost") {
    return {
      kind: "lost" as const,
      eyebrow: "Not awarded",
      title: "This job went to another vendor",
      body: "The reverse auction is closed. Your bid was not selected.",
    };
  }
  if (page.outcome === "cancelled") {
    return {
      kind: "closed" as const,
      eyebrow: "Cancelled",
      title: "This reverse auction was cancelled",
      body: "The property manager ended bidding without awarding a vendor.",
    };
  }
  if (page.outcome === "expired") {
    return {
      kind: "closed" as const,
      eyebrow: "Ended",
      title: "This reverse auction ended",
      body: "Bidding closed without an award.",
    };
  }
  if (page.status !== "open") {
    return {
      kind: "closed" as const,
      eyebrow: "Closed",
      title: "This reverse auction is closed",
      body: "Bidding is no longer open on this opportunity.",
    };
  }
  return null;
}

export default function VendorBidPage() {
  const params = useParams<{ token: string }>();
  const [page, setPage] = useState<BidPage | null>(null);
  const [status, setStatus] = useState<"loading" | "form" | "done" | "error">("loading");
  const [message, setMessage] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  function load() {
    fetch(`/api/vendors/bid/${params.token}`)
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (!ok) { setStatus("error"); setMessage(body.error || "This bid link is not valid."); return; }
        setPage(body);
        if (body.ownBid) setAmount(String(body.ownBid.amountCents / 100));
        setStatus(body.status === "open" ? "form" : "done");
        setMessage("");
      })
      .catch(() => { setStatus("error"); setMessage("Could not load this opportunity."); });
  }

  useEffect(() => { load(); }, [params.token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(`/api/vendors/bid/${params.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, notes }),
    });
    const body = await response.json();
    if (!response.ok) { setMessage(body.error || "Could not submit bid"); return; }
    setMessage("Your bid is in. You can lower it while the auction is open.");
    load();
  }

  const outcome = page ? outcomeCopy(page) : null;
  const leadLabel = page?.outcome === "won" || page?.status === "awarded" ? "Winning bid" : "Leading bid";

  return (
    <main className="intakeShell">
      <section className="intakeCard">
        <BrandLockup artwork="lockup" />
        {status === "error" ? (
          <div className="successPanel">
            <p className="eyebrow">LINK NOT VALID</p>
            <h1>This opportunity is unavailable.</h1>
            <p>{message}</p>
          </div>
        ) : !page || status === "loading" ? (
          <p>Loading opportunity…</p>
        ) : (
          <>
            <p className="eyebrow">{page.organizationName}</p>
            <h1>{page.title}</h1>
            <p>{page.city}{page.state ? `, ${page.state}` : ""} {page.postalCode || ""} · Needed {page.neededBy ? new Date(page.neededBy).toLocaleString() : "as soon as possible"}</p>
            <p className="vendorAs">Bidding as {page.vendorName}</p>
            <div className="miniStats vendorMini">
              <div><span>{leadLabel}</span><strong>{money(page.leadingCents)}</strong></div>
              <div><span>Your bid</span><strong>{page.ownBid ? money(page.ownBid.amountCents) : "None"}</strong></div>
              <div><span>Budget</span><strong>{page.budgetCents == null ? "Open" : money(page.budgetCents)}</strong></div>
              <div><span>{page.status === "open" ? "Active bids" : "Bids"}</span><strong>{page.bidCount}</strong></div>
            </div>
            {outcome && (
              <div className={`outcomeBanner ${outcome.kind}`}>
                <p className="eyebrow">{outcome.eyebrow}</p>
                <strong>{outcome.title}</strong>
                <p>{outcome.body}</p>
              </div>
            )}
            {page.fieldUrl && (
              <a className="primary jobSiteLink" href={page.fieldUrl}>Open job site for the crew</a>
            )}
            {status === "form" && page.autobid?.enabled && page.autobidBlocked && (
              <div className="notice">Autobid is paused: {page.autobidBlocked}. Connect your service calendar in HomeOps before autobid can fire.</div>
            )}
            {message && <div className="notice">{message}</div>}
            {status === "form" && (
              <form onSubmit={submit}>
                <label>Your bid ($)<input required type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
                <label>Notes<textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Crew size, materials, or when you can start. Do not upload W-9s or insurance here." /></label>
                <button className="primary" type="submit">{page.ownBid ? "Lower or update bid" : "Submit bid"}</button>
              </form>
            )}
          </>
        )}
      </section>
    </main>
  );
}
