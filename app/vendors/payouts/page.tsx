"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import StripeSetupForm from "@/components/stripe-setup-form";
import VendorPortalFrame from "@/components/vendor-portal-frame";

type Bank = {
  bankName: string | null;
  last4: string | null;
  status: "missing" | "pending" | "confirmed";
  confirmedAt?: string | null;
};

export default function VendorPayoutPage() {
  const router = useRouter();
  const [bank, setBank] = useState<Bank | null>(null);
  const [stripeOn, setStripeOn] = useState(false);
  const [secret, setSecret] = useState("");
  const [publishableKey, setPublishableKey] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [bankName, setBankName] = useState("");
  const [last4, setLast4] = useState("");
  const [message, setMessage] = useState("");

  function apply(body: { bank?: Bank; stripe?: boolean; publishableKey?: string | null; error?: string; notice?: string }) {
    if (body.error) { setMessage(body.error); return; }
    if (body.bank) setBank(body.bank);
    if (typeof body.stripe === "boolean") setStripeOn(body.stripe);
    if (body.publishableKey) setPublishableKey(body.publishableKey);
    if (body.notice) setMessage(body.notice);
  }

  useEffect(() => {
    fetch("/api/vendors/payouts").then(async (r) => {
      if (r.status === 401) { router.replace("/vendors/login"); return null; }
      return r.json();
    }).then((body) => { if (body) apply(body); }).catch(() => setMessage("Could not load the payout account."));
  }, [router]);

  async function startStripe() {
    const response = await fetch("/api/vendors/payouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setup" }),
    });
    const body = await response.json();
    if (!response.ok) { setMessage(body.error || "Could not start the payment processor."); return; }
    setSecret(body.clientSecret || "");
    setPublishableKey(body.publishableKey || "");
    setAccountEmail(body.accountEmail || "");
  }

  async function confirmDemo(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/vendors/payouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm", bankName, last4 }),
    });
    const body = await response.json();
    if (!response.ok) { setMessage(body.error || "Could not confirm the account."); return; }
    setMessage(body.notice || "Bank account confirmed for payouts.");
    apply(body);
    setSecret("");
  }

  async function replace() {
    const response = await fetch("/api/vendors/payouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "replace" }),
    });
    const body = await response.json();
    if (!response.ok) { setMessage(body.error || "Could not clear the account."); return; }
    setMessage("Previous account cleared. Confirm the new bank below.");
    apply(body);
  }

  const statusLabel = bank?.status === "confirmed" ? "Confirmed" : bank?.status === "pending" ? "Needs confirmation" : "Not on file";

  return (
    <VendorPortalFrame
      eyebrow="PAYOUT ACCOUNT"
      title="Bank account for job payments."
      lede="Review the account portonOS pays, replace it, or confirm it. When the payment processor is connected, the bank details are entered with the payment processor and only the bank name and last four digits come back here."
    >
      {message && <div className="notice">{message}</div>}
      <div className="miniStats vendorMini">
        <div><span>Status</span><strong>{statusLabel}</strong></div>
        <div><span>Bank</span><strong>{bank?.bankName || "—"}</strong></div>
        <div><span>Account</span><strong>{bank?.last4 ? `•••• ${bank.last4}` : "—"}</strong></div>
        <div><span>Confirmed</span><strong>{bank?.confirmedAt ? new Date(bank.confirmedAt).toLocaleDateString() : "—"}</strong></div>
      </div>
      <div className="vendorFilters">
        {stripeOn && <button className="primary" onClick={() => void startStripe()}>{bank?.status === "missing" ? "Add bank with the payment processor" : "Change bank with the payment processor"}</button>}
        {bank?.status !== "missing" && !stripeOn && <button className="secondaryBtn" onClick={() => void replace()}>Replace account</button>}
      </div>
      {secret && publishableKey && (
        <div className="stripeBox">
          <StripeSetupForm
            publishableKey={publishableKey}
            clientSecret={secret}
            accountEmail={accountEmail}
            onCancel={() => setSecret("")}
            onSaved={(paymentMethodId) => {
              void fetch("/api/vendors/payouts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "confirm", paymentMethodId }),
              }).then(async (r) => {
                const body = await r.json();
                if (!r.ok) { setMessage(body.error || "The payment processor saved the bank, but portonOS could not read it back."); return; }
                setMessage("The payment processor confirmed this bank account for payouts.");
                setSecret("");
                apply(body);
              });
            }}
          />
        </div>
      )}
      {!stripeOn && (bank?.status === "missing" || bank?.status === "pending") && (
        <form className="formGrid" onSubmit={confirmDemo}>
          <label>Bank name<input required value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Example Bank" /></label>
          <label>Account last 4<input required inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value)} placeholder="1234" /></label>
          <button className="primary" type="submit">{bank?.status === "pending" ? "Confirm this account" : "Save and confirm"}</button>
        </form>
      )}
      {!stripeOn && <p className="summary">This server has no payment processor secret key, so the form stores the bank name and last four only. Turn on the payment processor&apos;s test keys to collect and confirm the account with the payment processor.</p>}
    </VendorPortalFrame>
  );
}
