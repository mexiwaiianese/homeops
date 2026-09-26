"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import BrandLockup from "@/components/brand-lockup";
import { owners as demoOwners } from "@/lib/data";

type Provider = "google" | "apple";

export default function OwnerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const configured = Boolean(projectUrl && publishableKey);
  const redirectTo = () => `${window.location.origin}/auth/callback?next=/owners`;

  async function enterDemo(ownerId: string) {
    setBusy(ownerId);
    const response = await fetch("/api/owners/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerId }) });
    const body = await response.json();
    setBusy("");
    if (!response.ok) { setMessage(body.error || "Could not open the owner portal."); return; }
    router.push("/owners");
  }

  async function signInWithEmail(event: React.FormEvent) {
    event.preventDefault();
    if (!configured) { setMessage("Demo mode: choose an owner below. Live owner accounts require Supabase."); return; }
    setBusy("email");
    const supabase = createBrowserClient(projectUrl!, publishableKey!);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo(), shouldCreateUser: true } });
    setBusy("");
    setMessage(error ? error.message : "Check your email for your owner portal link.");
  }

  // Google / Apple use Supabase OAuth. The provider must be enabled in the Supabase dashboard
  // and /auth/callback added as a redirect URL. First sign-in links to the owner by verified email.
  async function signInWithProvider(provider: Provider) {
    if (!configured) { setMessage(`Demo mode: ${provider === "google" ? "Google" : "Apple"} sign-in needs Supabase. Choose a demo owner below.`); return; }
    setBusy(provider);
    const supabase = createBrowserClient(projectUrl!, publishableKey!);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: redirectTo(),
        queryParams: provider === "google" ? { access_type: "online", prompt: "select_account" } : undefined,
      },
    });
    if (error) { setBusy(""); setMessage(error.message); }
  }

  return (
    <main className="intakeShell">
      <section className="intakeCard jobCard opLoginCard">
        <BrandLockup artwork="lockup" />
        <p className="eyebrow">OWNER PORTAL</p>
        <h1>See how your properties are doing.</h1>
        <p>Cash to you, NOI, occupancy, closed statements, and answers to your own questions — for the properties your manager runs in HomeOps.</p>

        <div className="opProviders">
          <button type="button" className="opProviderBtn" onClick={() => void signInWithProvider("google")} disabled={Boolean(busy)}>
            <GoogleMark />
            {busy === "google" ? "Opening Google…" : "Continue with Google"}
          </button>
          <button type="button" className="opProviderBtn apple" onClick={() => void signInWithProvider("apple")} disabled={Boolean(busy)}>
            <AppleMark />
            {busy === "apple" ? "Opening Apple…" : "Continue with Apple"}
          </button>
        </div>
        <div className="opDivider"><span>or use email</span></div>

        <form onSubmit={signInWithEmail}>
          <label>Email your manager has on file
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" />
          </label>
          <button className="primary" type="submit" disabled={!email || Boolean(busy)}>{busy === "email" ? "Sending…" : "Email me a sign-in link"}</button>
        </form>
        {message && <div className="notice">{message}</div>}
        <p className="opHint">Use the same email address your property manager has on file. Google and Apple sign-in link to that address the first time you use them.</p>

        {!configured && (
          <>
            <div className="sectionTitle"><h3>Demo owners</h3><span>No password</span></div>
            <div className="credentialList">
              {demoOwners.map((owner) => (
                <div className="credential" key={owner.id}>
                  <div>
                    <strong>{owner.name}</strong>
                    <span>{owner.homes} {owner.homes === 1 ? "property" : "properties"} · {owner.email}</span>
                  </div>
                  <button className="primary" disabled={Boolean(busy)} onClick={() => void enterDemo(owner.id)}>{busy === owner.id ? "Opening…" : "Open portal"}</button>
                </div>
              ))}
            </div>
          </>
        )}
        <a href="/login">Property manager sign-in</a>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.4 28.7A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.6-2 15.4-5.6l-7.5-5.8c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.7-4.1-13.6-9.8l-7.8 6C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3.1 2.4 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.7-1-2.7-3.8zM14.1 5.4c.7-.8 1.1-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z" />
    </svg>
  );
}
