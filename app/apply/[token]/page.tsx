"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import BrandLockup from "@/components/brand-lockup";
import StripePayForm from "@/components/stripe-pay-form";
import { adultsToScreen } from "@/lib/applications";

type Listing = {
  headline: string;
  address: string;
  city: string;
  rentCents: number;
  depositCents: number;
  availableOn: string | null;
  bedrooms: number;
  bathrooms: number;
  petPolicy: string;
  leaseTerm: string;
  feeCents: number;
  status: string;
};

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

function ScreeningLinks({ url, adults, demo }: { url: string; adults: string[]; demo: boolean }) {
  return (
    <div>
      <p className="eyebrow">SCREENING</p>
      <h2>Each adult opens this link and pays RentSpree.</h2>
      <p>RentSpree charges for the credit, criminal, and eviction report. The credit report is included, because criminal and eviction results are not returned without it. portonOS does not take a card for that report. The listing application fee is a separate fee.</p>
      {demo && <p>This is a stand-in link. It does not open RentSpree.</p>}
      <div className="taskList">
        {adults.map((name) => (
          <a key={name} className="homeRow" href={url} target="_blank" rel="noreferrer">
            <div>
              <strong>{name}</strong>
              <span style={{ overflowWrap: "anywhere" }}>{url}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export default function ApplyPage() {
  const params = useParams<{ token: string }>();
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [feeStatus, setFeeStatus] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [screeningPayUrl, setScreeningPayUrl] = useState<string | null>(null);
  const [screeningDemo, setScreeningDemo] = useState(false);
  const [adults, setAdults] = useState<string[]>([]);

  useEffect(() => {
    void fetch(`/api/apply/${params.token}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) { setError(body.error || "This application link is not valid."); return; }
        setListing(body.listing);
      })
      .catch(() => setError("Could not load this listing."));
  }, [params.token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const response = await fetch(`/api/apply/${params.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, screeningConsent: consent }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setError(body.error || "Could not submit the application."); return; }
    setApplicationId(body.applicationId);
    setFeeStatus(body.feeStatus);
    setScreeningPayUrl(body.screeningPayUrl || null);
    setScreeningDemo(body.mode === "demo");
    setAdults(adultsToScreen(String(payload.fullName || ""), String(payload.otherAdults || "")));
    if (body.feeStatus === "unpaid") await startFee(body.applicationId);
  }

  async function startFee(id: string) {
    const response = await fetch(`/api/apply/${params.token}/fee`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId: id }),
    });
    const body = await response.json();
    if (!response.ok) { setError(body.error || "Could not start the application fee."); return; }
    if (body.feeStatus) setFeeStatus(body.feeStatus);
    if (body.clientSecret) {
      setClientSecret(body.clientSecret);
      setPublishableKey(body.publishableKey);
    }
  }

  async function demoPay() {
    if (!applicationId) return;
    setBusy(true);
    const response = await fetch(`/api/apply/${params.token}/fee`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId, action: "demo-pay" }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setError(body.error || "Could not record the fee."); return; }
    setFeeStatus(body.feeStatus);
  }

  async function paid(paymentIntentId?: string) {
    if (!applicationId) return;
    const response = await fetch(`/api/apply/${params.token}/fee`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId, action: "confirm", paymentIntentId }),
    });
    const body = await response.json();
    if (response.ok) setFeeStatus(body.feeStatus || "paid");
  }

  const done = feeStatus === "paid" || feeStatus === "waived";

  return (
    <main className="intakeShell">
      <section className="intakeCard">
        <BrandLockup artwork="lockup" />
        {!listing && !error && <p>Loading listing…</p>}
        {error && !listing && <div className="notice error">{error}</div>}
        {listing && done && (
          <div className="successPanel">
            <p className="eyebrow">APPLICATION RECEIVED</p>
            <h1>Thanks. The property manager has your application.</h1>
            <p>{listing.address} · {money(listing.rentCents)} / month</p>
            <p>{feeStatus === "waived" ? "No application fee is due." : "The application fee is recorded."} {screeningPayUrl ? "The listing application fee is separate from screening." : "Screening happens after review."} Do not send a Social Security number by email.</p>
            {screeningPayUrl && <ScreeningLinks url={screeningPayUrl} adults={adults.length ? adults : ["Applicant"]} demo={screeningDemo} />}
          </div>
        )}
        {listing && applicationId && !done && (
          <div>
            <p className="eyebrow">APPLICATION FEE</p>
            <h1>Pay {money(listing.feeCents)} to finish.</h1>
            <p>This is the application fee for {listing.address}. A credit, criminal, and eviction report is a separate charge at the screening partner&apos;s price. Card details stay with the payment processor.</p>
            {clientSecret && publishableKey ? (
              <StripePayForm publishableKey={publishableKey} clientSecret={clientSecret} onPaid={paid} buttonLabel={`Pay ${money(listing.feeCents)}`} />
            ) : (
              <button className="primary" disabled={busy} onClick={() => void demoPay()}>{busy ? "Recording…" : `Pay ${money(listing.feeCents)} (demo)`}</button>
            )}
            {screeningPayUrl && <ScreeningLinks url={screeningPayUrl} adults={adults.length ? adults : ["Applicant"]} demo={screeningDemo} />}
            {error && <div className="notice error">{error}</div>}
          </div>
        )}
        {listing && !applicationId && (
          <form onSubmit={submit}>
            <p className="eyebrow">RENTAL APPLICATION</p>
            <h1>{listing.headline}</h1>
            <p>{[listing.address, listing.city].map((part) => part.trim()).filter(Boolean).join(", ")} · {listing.bedrooms} bed / {listing.bathrooms} bath · {money(listing.rentCents)} / month · deposit {money(listing.depositCents)}</p>
            <p>{listing.leaseTerm}{listing.availableOn ? ` · available ${listing.availableOn.slice(0, 10)}` : ""} · {listing.petPolicy}</p>
            <p>Application fee {listing.feeCents ? money(listing.feeCents) : "waived"}. A credit, criminal, and eviction report is a separate charge at the screening partner&apos;s price. Leave Social Security numbers off this form.</p>
            <div className="formGrid">
              <label>Full name<input name="fullName" required /></label>
              <label>Email<input name="email" type="email" required /></label>
              <label>Phone<input name="phone" /></label>
              <label>Desired move-in<input name="desiredMoveIn" type="date" /></label>
              <label>Household size<input name="householdSize" type="number" min={1} defaultValue={1} required /></label>
              <label>Monthly income ($)<input name="monthlyIncome" type="number" min={0} step="0.01" /></label>
              <label>Employer<input name="employer" /></label>
              <label>Job title<input name="jobTitle" /></label>
              <label>How long there<input name="employmentLength" placeholder="e.g. 3 years" /></label>
              <label className="span2">People who will live here<textarea name="occupants" rows={3} placeholder="One name per line" /></label>
              <label className="span2">Other adults to screen<textarea name="otherAdults" rows={2} placeholder="One name per line. Leave blank if only you will be screened. Children do not need a report." /></label>
              <label className="span2">Current address<input name="currentAddress" /></label>
              <label>Current landlord<input name="landlordName" /></label>
              <label>Landlord phone<input name="landlordPhone" /></label>
              <label>Current rent ($)<input name="currentRent" type="number" min={0} step="0.01" /></label>
              <label>Reason for moving<input name="reasonForMove" /></label>
              <label>Pets<input name="pets" placeholder="None, or type and count" /></label>
              <label>Vehicles<input name="vehicles" /></label>
            </div>
            <label className="checkRow">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span><strong>I consent to a rental screening</strong><small>Income, rental history, and a consumer report may be reviewed before a lease is offered.</small></span>
            </label>
            <button className="primary" disabled={busy || !consent}>{busy ? "Submitting…" : "Submit application"}</button>
            {error && <div className="notice error">{error}</div>}
          </form>
        )}
      </section>
    </main>
  );
}
