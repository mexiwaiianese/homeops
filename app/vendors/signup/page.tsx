"use client";

import { FormEvent, useEffect, useState } from "react";
import BrandLockup from "@/components/brand-lockup";
import { PAYMENT_PROCESSOR, PROCESSOR_RATE, PROCESSOR_RATE_NOTE } from "@/lib/public-site";
import { VENDOR_BASE_CENTS, VENDOR_PAYMENTS_ADDON_CENTS, dollars, pricedMonthlyCents, vendorMonthlyCents, type VendorPromo } from "@/lib/vendor-plans";

export default function VendorSignupPage() {
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [trade, setTrade] = useState("");
  const [payments, setPayments] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<VendorPromo | null>(null);
  const [promoNote, setPromoNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const listCents = vendorMonthlyCents(payments);
  const dueCents = pricedMonthlyCents(payments, promo);
  const dueLabel = dueCents === 0 ? "Free" : `${dollars(dueCents)}/mo`;

  async function checkPromo(raw: string) {
    const code = raw.trim();
    if (!code) {
      setPromo(null);
      setPromoNote("");
      return null;
    }
    const response = await fetch("/api/vendors/promo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const body = await response.json();
    if (!response.ok) {
      setPromo(null);
      setPromoNote(body.error || "That promo code is not active.");
      return null;
    }
    setPromo(body.promo);
    setPromoInput(body.promo.code);
    setPromoNote("");
    return body.promo as VendorPromo;
  }

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      setPromoInput(code);
      void checkPromo(code);
    }
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const applied = promo && promo.code === promoInput.trim().toUpperCase() ? promo : await checkPromo(promoInput);
    if (promoInput.trim() && !applied) {
      setBusy(false);
      return;
    }
    const response = await fetch("/api/vendors/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName, contactName, email, phone, city, state, trade, payments, promoCode: applied?.code || "" }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not create the account."); return; }
    if (body.mode === "live") {
      setMessage(body.message || `Check ${email} for a one-time sign-in link.`);
      if (body.devLink) window.location.assign(body.devLink);
      return;
    }
    window.location.assign("/vendors/invoices");
  }

  return (
    <main className="intakeShell">
      <section className="intakeCard jobCard">
        <BrandLockup artwork="lockup" />
        <p className="eyebrow">VENDOR DESK · {dueCents === 0 ? "FREE" : `${dollars(dueCents)}/MO`}</p>
        <h1>Create your vendor account.</h1>
        <p>The portonOS Vendor Desk is a private workspace for invited vendors to track jobs, crew time, and invoices.</p>
        <p>Only vendors invited from a vetted list can join. You do not pay to look eligible. This plan does not include AI features.</p>
        <div className="planGrid">
          <div className={!payments ? "planCard on" : "planCard"}>
            <strong>{dollars(VENDOR_BASE_CENTS)} a month</strong>
            <span>Projects, crew time, email invoices</span>
            <ul className="planList">
              <li>Project list with crew time from arrival to departure.</li>
              <li>Email invoices as a link to a clean PDF.</li>
            </ul>
          </div>
          <label className={payments ? "planCard on" : "planCard"}>
            <span className="planPick">
              <input type="checkbox" checked={payments} onChange={(e) => setPayments(e.target.checked)} />
              <strong>Add {dollars(VENDOR_PAYMENTS_ADDON_CENTS)} a month · {dollars(VENDOR_BASE_CENTS + VENDOR_PAYMENTS_ADDON_CENTS)} total</strong>
            </span>
            <span>Online payments</span>
            <ul className="planList">
              <li>A pay-by-card link on every invoice.</li>
              <li>Card processing is {PAYMENT_PROCESSOR}&apos;s rate, {PROCESSOR_RATE}, passed through. No added percentage. <small>{PROCESSOR_RATE_NOTE}</small></li>
              <li>Promo codes do not discount this add-on.</li>
            </ul>
          </label>
        </div>
        <form onSubmit={submit}>
          <label>Company<input required value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="North Heating" /></label>
          <label>Your name<input required value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Alex Rivera" /></label>
          <label>Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="office@company.com" /></label>
          <label>Phone<input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(801) 555-0100" /></label>
          <label>Trade<input required value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="HVAC" /></label>
          <div className="formGrid">
            <label>City<input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lehi" /></label>
            <label>State<input value={state} onChange={(e) => setState(e.target.value)} placeholder="UT" /></label>
          </div>
          <label>
            Promo code
            <span className="promoRow">
              <input
                value={promoInput}
                onChange={(e) => {
                  setPromoInput(e.target.value);
                  if (promo && e.target.value.trim().toUpperCase() !== promo.code) setPromo(null);
                }}
                placeholder="Code"
                autoCapitalize="characters"
              />
              <button className="secondaryBtn" type="button" onClick={() => void checkPromo(promoInput)}>Apply</button>
            </span>
          </label>
          {promo && (
            <p className="promoApplied">
              {promo.label} applied. {dueLabel}
              {dueCents !== listCents && <s>{dollars(listCents)}/mo</s>}
              {payments && dueCents > 0 && <em> · base plan free, online payments {dollars(VENDOR_PAYMENTS_ADDON_CENTS)}/mo</em>}
            </p>
          )}
          {promoNote && <div className="notice error">{promoNote}</div>}
          <button className="primary" type="submit" disabled={busy}>{busy ? "Creating…" : `Create account · ${dueLabel}`}</button>
        </form>
        {message && <div className="notice">{message}</div>}
        <a href="/vendors/login">Already registered? Sign in</a>
      </section>
    </main>
  );
}
