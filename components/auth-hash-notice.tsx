"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { authErrorMessage } from "@/lib/auth-errors";

const HASH_KEY = "portonos_auth_hash";

/** Supabase puts OTP failures and implicit tokens in the URL hash, which the server never sees. */
export default function AuthHashNotice() {
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"error" | "info">("error");

  useEffect(() => {
    const liveHash = window.location.hash.replace(/^#/, "");
    if (liveHash) sessionStorage.setItem(HASH_KEY, liveHash);
    const params = new URLSearchParams(liveHash || sessionStorage.getItem(HASH_KEY) || "");
    const query = new URLSearchParams(window.location.search);
    if (query.get("confirmed")) {
      setTone("info");
      setMessage("Your email is confirmed. Sign in with a link, Google, Apple, or a password.");
    }

    const errorCode = params.get("error_code") || params.get("error") || "";
    const description = params.get("error_description") || "";
    if (errorCode || description) {
      const text = authErrorMessage(description || errorCode);
      if (text) {
        setTone("error");
        setMessage(text);
      }
      stripHash();
      window.setTimeout(() => sessionStorage.removeItem(HASH_KEY), 2000);
      return;
    }

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const type = (params.get("type") || query.get("type") || "").toLowerCase();
    if (!accessToken) return;

    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!publishableKey || !projectUrl) return;

    const supabase = createBrowserClient(projectUrl, publishableKey);
    void supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken || "" }).then(() => {
      sessionStorage.removeItem(HASH_KEY);
      stripHash();
      const next = type === "signup" || type === "email_change" || type === "email"
        ? "/login?confirmed=1"
        : `/auth/callback${window.location.search}`;
      window.location.replace(next);
    });
  }, []);

  if (!message) return null;
  return (
    <div className={tone === "error" ? "notice error" : "notice"} role="alert" style={{ margin: "12px auto", maxWidth: 520 }}>
      {message}
    </div>
  );
}

function stripHash() {
  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}
