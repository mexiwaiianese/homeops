"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import BrandLockup from "@/components/brand-lockup";
import StripePayForm from "@/components/stripe-pay-form";
import { moneyCents } from "@/lib/rent";

type Charge = {
  tenantName: string;
  address: string;
  kind: string;
  amountCents: number;
  remainingCents: number;
  dueOn: string;
  status: string;
  periodStart: string;
};

export default function TenantPayPage() {
  const params = useParams<{ token: string }>();
  const [charge, setCharge] = useState<Charge | null>(null);
  const [mode, setMode] = useState("loading");
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    fetch(`/api/rent/pay/${params.token}`)
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (!ok) { setMode("error"); setMessage(body.error || "This pay link is not valid."); return; }
        setCharge(body.charge);
        setPublishableKey(body.publishableKey);
        setMode(body.charge.remainingCents <= 0 ? "paid" : "ready");
      })
      .catch(() => { setMode("error"); setMessage("Could not load this payment."); });
  }

  useEffect(() => { load(); }, [params.token]);

  async function startStripe() {
    setBusy(true);
    const response = await fetch(`/api/rent/pay/${params.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "intent" }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not start Stripe checkout."); return; }
    if (body.demoPay) { setMessage("Stripe keys are not on this server. Use demo pay below."); return; }
    setClientSecret(body.clientSecret);
    setPublishableKey(body.publishableKey || publishableKey);
  }

  async function demoPay() {
    setBusy(true);
    const response = await fetch(`/api/rent/pay/${params.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "demo-pay", method: "demo" }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not record payment."); return; }
    setCharge(body.charge);
    setMode("paid");
  }

  return (
    <main className="intakeShell">
      <section className="intakeCard jobCard">
        <BrandLockup artwork="lockup" />
        {mode === "error" ? (
          <div className="successPanel">
            <p className="eyebrow">PAY LINK</p>
            <h1>This payment is unavailable.</h1>
            <p>{message}</p>
          </div>
        ) : !charge || mode === "loading" ? (
          <p>Loading payment…</p>
        ) : mode === "paid" ? (
          <div className="successPanel">
            <p className="eyebrow">RECEIPT</p>
            <h1>Rent is paid.</h1>
            <p>{charge.address} · {moneyCents(charge.amountCents)} recorded for {charge.tenantName}.</p>
          </div>
        ) : (
          <>
            <p className="eyebrow">RENT PAYMENT</p>
            <h1>{moneyCents(charge.remainingCents)}</h1>
            <p>{charge.address} · due {new Date(`${charge.dueOn}T12:00:00`).toLocaleDateString()} · {charge.kind.replace("_", " ")}</p>
            <p className="summary">Pay inside HomeOps. Stripe processes the card or bank debit; this page is the receipt and Autopay setup surface.</p>
            {message && <div className="notice">{message}</div>}
            {clientSecret && publishableKey ? (
              <StripePayForm publishableKey={publishableKey} clientSecret={clientSecret} onPaid={() => { setMode("paid"); load(); }} />
            ) : (
              <div className="visitActions">
                {publishableKey && (
                  <button className="primary" disabled={busy} onClick={() => void startStripe()}>
                    {busy ? "Starting…" : "Pay with card or bank"}
                  </button>
                )}
                <button className="secondaryBtn" disabled={busy} onClick={() => void demoPay()}>
                  {busy ? "Recording…" : publishableKey ? "Record a demo payment" : "Pay in demo mode"}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
