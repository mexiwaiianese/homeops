"use client";

import { FormEvent, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

function InnerForm({ onPaid }: { onPaid: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });
    setBusy(false);
    if (result.error) { setMessage(result.error.message || "Payment could not be completed."); return; }
    onPaid();
  }

  return (
    <form onSubmit={submit}>
      <PaymentElement options={{ layout: "tabs" }} />
      <button className="primary" type="submit" disabled={!stripe || busy} style={{ marginTop: 16, width: "100%" }}>
        {busy ? "Processing…" : "Pay rent"}
      </button>
      {message && <div className="notice error">{message}</div>}
    </form>
  );
}

export default function StripePayForm({
  publishableKey,
  clientSecret,
  onPaid,
}: {
  publishableKey: string;
  clientSecret: string;
  onPaid: () => void;
}) {
  const stripePromise = useMemo(() => loadStripe(publishableKey), [publishableKey]);
  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" } }}>
      <InnerForm onPaid={onPaid} />
    </Elements>
  );
}
