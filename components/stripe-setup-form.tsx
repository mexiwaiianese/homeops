"use client";

import { FormEvent, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

// Saves a card or US bank account to the tenant's Stripe customer via a SetupIntent.
// No card data touches HomeOps servers.

function InnerForm({ onSaved, onCancel }: { onSaved: (paymentMethodId?: string) => void; onCancel?: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    const result = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });
    setBusy(false);
    if (result.error) { setMessage(result.error.message || "Could not save this payment method."); return; }
    const pm = result.setupIntent?.payment_method;
    onSaved(typeof pm === "string" ? pm : pm?.id);
  }

  return (
    <form onSubmit={submit}>
      <PaymentElement options={{ layout: "tabs" }} />
      <div className="visitActions">
        <button className="primary" type="submit" disabled={!stripe || busy}>{busy ? "Saving…" : "Save payment method"}</button>
        {onCancel && <button className="secondaryBtn" type="button" onClick={onCancel} disabled={busy}>Cancel</button>}
      </div>
      {message && <div className="notice error">{message}</div>}
    </form>
  );
}

export default function StripeSetupForm({
  publishableKey,
  clientSecret,
  onSaved,
  onCancel,
}: {
  publishableKey: string;
  clientSecret: string;
  onSaved: (paymentMethodId?: string) => void;
  onCancel?: () => void;
}) {
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);
  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
      <InnerForm onSaved={onSaved} onCancel={onCancel} />
    </Elements>
  );
}
