"use client";

import { FormEvent, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { authErrorMessage } from "@/lib/auth-errors";
import { appleAuthEnabled, googleAuthEnabled } from "@/lib/google-auth";

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
  const [busy, setBusy] = useState("");
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
    setBusy("email");
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
      setBusy("");
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
      setBusy("");
      setMessage("Could not reach the server. Wait a minute and try again.");
    }
  }

  async function sendPassword(event: FormEvent) {
    event.preventDefault();
    if (!configured) { setMessage("Sign-in is not configured on this server."); return; }
    setBusy("password");
    if (createPassword) {
      const response = await fetch("/api/auth/magic-link", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setBusy("");
        setMessage(authErrorMessage(body.error || "Could not create the account."));
        return;
      }
    }
    const signedIn = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const signedBody = await signedIn.json().catch(() => ({}));
    setBusy("");
    if (!signedIn.ok) { setMessage(authErrorMessage(signedBody.error || "That email or password is not valid.")); return; }
    window.location.assign(`/auth/callback?next=${encodeURIComponent(redirectTo)}`);
  }

  async function oauth(provider: "google" | "apple") {
    if (!configured) { setMessage("Sign-in is not configured on this server."); return; }
    setBusy(provider);
    const { error } = await client().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callbackUrl(),
        queryParams: provider === "google" ? { access_type: "online", prompt: "select_account" } : undefined,
      },
    });
    if (error) {
      setBusy("");
      setMessage(authErrorMessage(error.message));
    }
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
        <button className="primary" type="submit" disabled={Boolean(busy) || !email}>
          {busy === "email" || busy === "password" ? "Working…" : mode === "password" ? (createPassword ? "Create password" : "Sign in") : "Email me a sign-in link"}
        </button>
      </form>
      {message && <div className="notice" role="status">{message}</div>}
      {devLink && <p className="authSwitch">Email is not configured locally. Open <a href={devLink}>your sign-in link</a>.</p>}
      <p className="authSwitch">
        {mode === "magic" ? (
          <button className="textLink" type="button" onClick={() => setMode("password")}>Use a password instead</button>
        ) : (
          <button className="textLink" type="button" onClick={() => setMode("magic")}>Use a one-time email link instead</button>
        )}
      </p>
      {(googleAuthEnabled || appleAuthEnabled) && (
        <div className="authAlt">
          {googleAuthEnabled && (
            <button className="opProviderBtn" type="button" disabled={Boolean(busy)} onClick={() => void oauth("google")}>
              <GoogleMark />
              {busy === "google" ? "Opening Google…" : "Continue with Google"}
            </button>
          )}
          {appleAuthEnabled && (
            <button className="opProviderBtn apple" type="button" disabled={Boolean(busy)} onClick={() => void oauth("apple")}>
              <AppleMark />
              {busy === "apple" ? "Opening Apple…" : "Continue with Apple"}
            </button>
          )}
        </div>
      )}
      <p className="authFoot"><a href={registerHref}>{registerLabel}</a></p>
    </>
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
