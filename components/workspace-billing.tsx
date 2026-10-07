"use client";

import { FormEvent, useEffect, useState } from "react";
import { CANCEL_REASONS } from "@/lib/public-site";

type BillingView = {
  mode: "live" | "demo";
  packageName: string | null;
  canCancel: boolean;
  alreadyCanceled: boolean;
  refunded: boolean;
  accessUntil: string | null;
  reason: string | null;
  sample: boolean;
};

export default function WorkspaceBilling() {
  const [view, setView] = useState<BillingView | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    fetch("/api/workspace/billing")
      .then(async (response) => ({ ok: response.ok, body: await response.json() }))
      .then(({ ok, body }) => {
        if (!ok) {
          setError(body.error || "Sign in to the workspace.");
          return;
        }
        setView(body);
      })
      .catch(() => setError("Could not load billing."));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!confirmed || busy) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/workspace/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.error || "Could not cancel the workspace.");
      return;
    }
    setDone(body.message || "Canceled.");
  }

  return (
    <article className="marketingArticle billingCancel">
      <p className="eyebrow">Billing</p>
      <h1>Cancel the workspace</h1>
      <p>
        Billed once a year. Cancel within 30 days of the invoice and that invoice is refunded.
        After 30 days, you keep the workspace until the renewal date and you are not billed again.
        Applicant screening and card processing are the partner&apos;s charges and are not part of the refund.
        {" "}<a href="/terms">Terms</a>.
      </p>
      {error && <div className="notice error">{error}</div>}
      {done && (
        <div className="notice">
          <p>{done}</p>
          <p><a href="/app">Back to the workspace</a> · <a href="/">portonOS home</a></p>
        </div>
      )}
      {!done && view?.alreadyCanceled && (
        <div className="notice">
          <p>{view.refunded ? "This workspace invoice was refunded. The workspace is closed." : view.accessUntil ? `Already canceled. You keep the workspace until ${view.accessUntil}.` : "Already canceled. You will not be billed again."}</p>
          {view.reason && <p>Reason: {view.reason}</p>}
        </div>
      )}
      {!done && view && !view.alreadyCanceled && view.canCancel && (
        <form onSubmit={(event) => void onSubmit(event)}>
          {view.sample && <p>This is a sample workspace. Nothing was charged.</p>}
          {view.packageName && <p>Package: {view.packageName}.</p>}
          <fieldset className="reasonChips">
            <legend>Why are you canceling? Optional.</legend>
            {CANCEL_REASONS.map((item) => (
              <button key={item} type="button" className={reason === item ? "secondaryBtn is-on" : "secondaryBtn"} onClick={() => setReason(item)}>
                {item}
              </button>
            ))}
          </fieldset>
          <label>
            Reason
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} placeholder="Optional. Leave this blank if you don't want to say." />
          </label>
          <label className="checkRow">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>Cancel this workspace.</span>
          </label>
          <button className="primary" type="submit" disabled={!confirmed || busy}>
            {busy ? "Canceling…" : "Cancel workspace"}
          </button>
        </form>
      )}
      {!done && view && !view.canCancel && <p>The workspace owner cancels billing.</p>}
      <p><a href="/app">Back to the workspace</a></p>
    </article>
  );
}
