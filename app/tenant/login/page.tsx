"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import BrandLockup from "@/components/brand-lockup";
import { tenants as demoTenants } from "@/lib/data";

function TenantLoginForm() {
  const searchParams = useSearchParams();
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(searchParams.get("error") || "");
  const [messageTone, setMessageTone] = useState<"" | "error">(searchParams.get("error") ? "error" : "");
  const [demoUrl, setDemoUrl] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [sent, setSent] = useState(false);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setDemoUrl(null);
    const response = await fetch("/api/tenant/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not send a sign-in link."); setMessageTone("error"); return; }
    setMessageTone("");
    setMessage(body.message);
    setSent(true);
    setDemoMode(body.mode === "demo");
    if (body.demoUrl) setDemoUrl(body.demoUrl);
  }

  return (
    <main className="intakeShell">
      <section className="intakeCard">
        <BrandLockup artwork="lockup" />
        <p className="eyebrow">TENANT PORTAL</p>
        <h1>Pay rent. Report a problem.</h1>
        <p className="summary">No password. Enter the email or mobile number on your lease and we will text or email you a one-time sign-in link.</p>
        <form onSubmit={requestLink}>
          <label>Email or mobile number
            <input
              type="text"
              inputMode="email"
              autoComplete="username"
              required
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="you@example.com or (555) 010-0003"
            />
          </label>
          <button className="primary" type="submit" disabled={busy || contact.trim().length < 5}>
            {busy ? "Sending…" : sent ? "Send another link" : "Text or email me a sign-in link"}
          </button>
        </form>
        {message && <div className={`notice ${messageTone}`}>{message}</div>}
        {demoUrl && (
          <div className="notice">
            <strong>Demo server.</strong> No email or SMS provider is configured, so here is the link that would have been delivered:
            <a className="primary demoLinkBtn" href={demoUrl}>Open my tenant portal</a>
          </div>
        )}
        {demoMode && !demoUrl && sent && (
          <div className="notice">
            Demo tenants: {demoTenants.map((t) => t.email).join(", ")}. Try one of those emails or phone numbers.
          </div>
        )}
        <p className="tenantFinePrint">Links expire after 15 minutes and work once. Signing in keeps you logged in on this device for 30 days.</p>
        <a href="/login">Property manager sign-in</a>
      </section>
    </main>
  );
}

export default function TenantLoginPage() {
  return (
    <Suspense fallback={<main className="intakeShell"><section className="intakeCard"><p>Loading…</p></section></main>}>
      <TenantLoginForm />
    </Suspense>
  );
}
