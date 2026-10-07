import { pageMeta } from "@/lib/site-meta";

export const metadata = pageMeta(
  "Vendor Desk Signup for Invited Trades | portonOS",
  "Create a portonOS Vendor Desk account for invited trades to track awarded jobs, crew time, invoices, and optional online payments.",
  "/vendors/signup",
);

export default function VendorSignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
