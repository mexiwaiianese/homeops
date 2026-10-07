import type { Metadata } from "next";
import { pageMeta } from "@/lib/site-meta";

const base = pageMeta(
  "Sign In to the portonOS Vendor Desk",
  "Sign in to the portonOS Vendor Desk with a one-time email link to open awarded jobs, add crew, and send invoices.",
  "/vendors/login",
);

export const metadata: Metadata = {
  ...base,
  robots: { index: false, follow: false },
};

export default function VendorLoginLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
