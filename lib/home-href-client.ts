"use client";

import { useEffect, useState } from "react";

const TTL_MS = 10_000;
let cached: { at: number; promise: Promise<string> } | null = null;

function safePath(value: unknown): string | null {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

/** Asks the server where the logo should go. One request is shared by every lockup on the page. */
export function fetchHomeHref(): Promise<string> {
  const now = Date.now();
  if (cached && now - cached.at < TTL_MS) return cached.promise;
  const promise = fetch("/api/home", { cache: "no-store", credentials: "same-origin" })
    .then((response) => (response.ok ? response.json() : null))
    .then((body) => safePath(body?.href) ?? "/")
    .catch(() => "/");
  cached = { at: now, promise };
  return promise;
}

/** Starts as `fallback` (what the server rendered), then switches to the session's home once known. */
export function useHomeHref(fallback = "/") {
  const [href, setHref] = useState(fallback);
  useEffect(() => {
    let active = true;
    fetchHomeHref().then((value) => {
      if (active) setHref(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return href;
}
