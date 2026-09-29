"use client";

import { FormEvent, useState } from "react";

export default function DevLoginForm({ error }: { error?: string }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState(error || "");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/dev/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not send the link."); return; }
    setSent(true);
    if (body.devLink) {
      setDevLink(body.devLink);
      setMessage("Email is not configured on this machine, so the login link is here. It expires in 20 minutes.");
      return;
    }
    setMessage("If that address can open operator tools, the login link is on its way. It expires in 20 minutes.");
  }

  return (
    <form onSubmit={submit}>
      <label>
        Email
        <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" disabled={sent} />
      </label>
      <button className="primary" type="submit" disabled={busy || sent}>{busy ? "Sending…" : "Email me a login link"}</button>
      {message && <div className={sent ? "notice" : "notice error"}>{message}</div>}
      {devLink && <a className="primary" href={devLink}>Open the login link</a>}
    </form>
  );
}
