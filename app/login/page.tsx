"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const configured = Boolean(projectUrl && publishableKey);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!configured) { setMessage("Add Supabase environment variables first. Demo mode is still available at /. "); return; }
    const supabase = createBrowserClient(projectUrl!, publishableKey!);
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    setMessage(error ? error.message : "Check your email for the HomeOps sign-in link.");
  }

  return (
    <main className="loginShell">
      <section className="loginBrand">
        <img className="loginBrandMark" src="/brand/homeops-lockup-dark.png" alt="HomeOps" />
        <p className="eyebrow">RENTAL HOME OS</p>
        <h1>Sign in to run the portfolio.</h1>
        <p>Maintenance, approved vendors, and owner rules live in one operating desk—not a public marketplace.</p>
      </section>
      <form className="loginCard" onSubmit={signIn}>
        <img className="loginLockup" src="/brand/homeops-lockup-light.png" alt="" />
        <p className="eyebrow">MANAGER ACCESS</p>
        <h2>Email a sign-in link</h2>
        <p>No password to remember. We’ll send a magic link to your inbox.</p>
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </label>
        <button className="primary" type="submit">Email me a sign-in link</button>
        {message && <div className="notice">{message}</div>}
        <a href="/">Return to demo</a>
        <a href="/vendors/login">Vendor desk sign-in</a>
        <a href="/owners/login">Owner portal sign-in</a>
      </form>
    </main>
  );
}
