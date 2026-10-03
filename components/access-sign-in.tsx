"use client";

import { FormEvent, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { authErrorMessage } from "@/lib/auth-errors";

type Mode = "magic" | "password";

export default function AccessSignIn({
  heading,
  lede,
  redirectTo,
  registerHref = "/vendors/signup",
  registerLabel = "Register a New Vendor",
  shouldCreateUser = false,
}: {
  heading: string;
  lede: string;
  redirectTo: string;
  registerHref?: string;
  registerLabel?: string;
  shouldCreateUser?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("magic");
  const [createPassword, setCreatePassword] = useState(false);
  const [message, setMessage] = useState("");
  const [devLink, setDevLink] = useState("");
  const [busy, setBusy] = useState(false);
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const configured = Boolean(projectUrl && publishableKey);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("sent") || params.get("confirmed")) {
      setMessage("Check your email for a one-time sign-in link. It stops working after you open it.");
    }
    if (params.get("error")) setMessage(authErrorMessage(params.get("error")));
  }, []);

  function client() {
    return createBrowserClient(projectUrl!, publishableKey!);
  }

  function callbackUrl() {
    const next = redirectTo.startsWith("/") ? redirectTo : "/login";
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  }

  async function sendMagic(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setDevLink("");
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 25000);
      const response = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, next: redirectTo, createUser: shouldCreateUser }),
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      const body = await response.json().catch(() => ({}));
      setBusy(false);
      if (!response.ok) {
        setMessage(authErrorMessage(body.error || "Could not send the sign-in link."));
        return;
      }
      if (body.devLink) {
        setDevLink(body.devLink);
        setMessage("Email is not configured on this server, so the sign-in link was not emailed. Open it below.");
        return;
      }
      setMessage(body.message || "Check your email for a one-time sign-in link. It stops working after you open it.");
    } catch {
      setBusy(false);
      setMessage("Could not reach the server. Wait a minute and try again.");
    }
  }

  async function sendPassword(event: FormEvent) {
    event.preventDefault();
    if (!configured) { setMessage("Sign-in is not configured on this server."); return; }
    setBusy(true);
    if (createPassword) {
      const response = await fetch("/api/auth/magic-link", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setBusy(false);
        setMessage(authErrorMessage(body.error || "Could not create the account."));
        return;
      }
    }
    const { error } = await client().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setMessage(authErrorMessage(error.message)); return; }
    window.location.assign(`/auth/callback?next=${encodeURIComponent(redirectTo)}`);
  }

  async function oauth(provider: "google" | "apple") {
    if (!configured) { setMessage("Sign-in is not configured on this server."); return; }
    setBusy(true);
    const { error } = await client().auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl() },
    });
    setBusy(false);
    if (error) setMessage(authErrorMessage(error.message));
  }

  return (
    <>
      <h2>{heading}</h2>
      <p>{lede}</p>
      <form onSubmit={mode === "password" ? sendPassword : sendMagic}>
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </label>
        {mode === "password" && (
          <>
            <label>
              Password
              <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label className="miniCheck">
              <input type="checkbox" checked={createPassword} onChange={(e) => setCreatePassword(e.target.checked)} />
              <span>Create a password for this email</span>
            </label>
          </>
        )}
        <button className="primary" type="submit" disabled={busy || !email}>
          {busy ? "Working…" : mode === "password" ? (createPassword ? "Create password" : "Sign in") : "Email me a sign-in link"}
        </button>
      </form>
      <p className="summary">
        {mode === "magic" ? (
          <button className="textLink" type="button" onClick={() => setMode("password")}>Use a password instead</button>
        ) : (
          <button className="textLink" type="button" onClick={() => setMode("magic")}>Use a one-time email link instead</button>
        )}
      </p>
      <div className="authAlt">
        <button className="secondaryBtn" type="button" disabled={busy} onClick={() => void oauth("google")}>Continue with Google</button>
        <button className="secondaryBtn" type="button" disabled={busy} onClick={() => void oauth("apple")}>Continue with Apple</button>
      </div>
      {message && <div className="notice">{message}</div>}
      {devLink && <p className="summary">Email is not configured locally. Open <a href={devLink}>your sign-in link</a>.</p>}
      <p><a href={registerHref}>{registerLabel}</a></p>
    </>
  );
}
