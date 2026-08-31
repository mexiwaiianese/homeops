"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && publishableKey);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!configured) { setMessage("Add Supabase environment variables first. Demo mode is still available at /. "); return; }
    const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, publishableKey!);
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    setMessage(error ? error.message : "Check your email for the HomeOps sign-in link.");
  }

  return <main className="authShell"><form className="authCard" onSubmit={signIn}><div className="brandMark">H</div><p className="eyebrow">HOMEOPS</p><h1>Sign in to your portfolio</h1><p>Use a magic link—no password to remember.</p><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" /></label><button className="primary" type="submit">Email me a sign-in link</button>{message && <div className="notice">{message}</div>}<a href="/">Return to demo</a></form></main>;
}
