"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function OperatorGoogleLogin({ nextPath, error }: { nextPath: string; error?: string }) {
  const [message, setMessage] = useState(error === "not-admin" ? "That Google account cannot open these tools." : "");
  const [busy, setBusy] = useState(false);
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  async function signIn() {
    if (!projectUrl || !publishableKey) {
      setMessage("Google sign-in needs Supabase configured on this server.");
      return;
    }
    setBusy(true);
    setMessage("");
    const supabase = createBrowserClient(projectUrl, publishableKey);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        queryParams: { access_type: "online", prompt: "select_account" },
      },
    });
    if (authError) {
      setBusy(false);
      setMessage(authError.message);
    }
  }

  return (
    <>
      <button type="button" className="opProviderBtn" onClick={() => void signIn()} disabled={busy}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z" />
          <path fill="#FBBC05" d="M10.4 28.7A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z" />
          <path fill="#34A853" d="M24 48c6.2 0 11.6-2 15.4-5.6l-7.5-5.8c-2.1 1.4-4.8 2.3-7.9 2.3-6.3 0-11.7-4.1-13.6-9.8l-7.8 6C6.5 42.6 14.6 48 24 48z" />
        </svg>
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {message && <div className="notice">{message}</div>}
    </>
  );
}
