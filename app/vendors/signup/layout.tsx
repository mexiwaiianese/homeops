import { pageMeta } from "@/lib/site-meta";

export const metadata = pageMeta(
  "portonOS Vendor Desk Signup",
  "Invited vendors from a vetted list open a portonOS vendor desk. $19 a month. Online payments on invoices add $10 a month. You do not pay to look eligible.",
  "/vendors/signup",
);

export default function VendorSignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
