"use client";

import { useState } from "react";

export default function EmailDeliverabilityTest() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  async function send() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/email-test", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    setOk(Boolean(body.ok));
    if (!response.ok || !body.ok) {
      setMessage(body.error || "Could not send the test email.");
      return;
    }
    setMessage(`Sent to ${body.to} from ${body.from}. Check that inbox (and spam).`);
  }

  return (
    <div className="adminEmailTest">
      <p className="eyebrow">DELIVERABILITY</p>
      <p>Send one Resend test to the platform admin inbox. No vendors are emailed.</p>
      <button className="secondaryBtn" type="button" disabled={busy} onClick={() => void send()}>
        {busy ? "Sending…" : "Send test email to nathan@dbx.dev"}
      </button>
      {message && <div className={ok ? "notice" : "notice error"}>{message}</div>}
    </div>
  );
}
