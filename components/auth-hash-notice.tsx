"use client";

import { useEffect, useState } from "react";
import { authErrorMessage } from "@/lib/auth-errors";

const HASH_KEY = "portonos_auth_hash";

/** Supabase puts OTP failures and implicit tokens in the URL hash, which the server never sees. */
export default function AuthHashNotice() {
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"error" | "info">("error");

  useEffect(() => {
    const liveHash = window.location.hash.replace(/^#/, "");
    // Only treat query-shaped hashes as Auth (access_token= / error=). Plain #demo must stay.
    if (liveHash && !liveHash.includes("=")) return;
    if (liveHash) sessionStorage.setItem(HASH_KEY, liveHash);
    const params = new URLSearchParams(liveHash || sessionStorage.getItem(HASH_KEY) || "");
    const query = new URLSearchParams(window.location.search);
    if (query.get("confirmed")) {
      setTone("info");
      setMessage("Your email is confirmed. Sign in with a link or a password.");
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
    if (!accessToken || !refreshToken) {
      sessionStorage.removeItem(HASH_KEY);
      stripHash();
      return;
    }
    void fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken, refreshToken }),
    }).then(async (response) => {
      sessionStorage.removeItem(HASH_KEY);
      stripHash();
      if (!response.ok) {
        setTone("error");
        setMessage("That sign-in link is not valid. Request a new one.");
        return;
      }
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
