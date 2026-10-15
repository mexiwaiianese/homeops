import type { Metadata } from "next";

/** Private product surfaces. These must not appear in search results. */
const NON_INDEXABLE_PREFIXES = [
  "/admin",
  "/dev",
  "/master",
  "/financials",
  "/fs",
  "/f/s",
];

export const NOINDEX_ROBOTS: Metadata["robots"] = { index: false, follow: false };

export function nonIndexablePath(pathname: string) {
  const path = pathname.split("?")[0] || "/";
  return NON_INDEXABLE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export const NON_INDEXABLE_ROBOTS_PATHS = NON_INDEXABLE_PREFIXES;
