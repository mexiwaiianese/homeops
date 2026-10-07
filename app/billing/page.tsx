import type { Metadata } from "next";
import WorkspaceBilling from "@/components/workspace-billing";
import { MarketingFooter, MarketingNav } from "@/components/marketing-chrome";
import { pageMeta } from "@/lib/site-meta";

export const dynamic = "force-dynamic";

const baseMetadata = pageMeta(
  "Workspace Billing | portonOS",
  "Review your portonOS workspace plan, annual billing, property overages, invoices, cancellation, and the 30-day invoice refund policy.",
  "/billing",
);

export const metadata: Metadata = {
  ...baseMetadata,
  robots: { index: false, follow: false },
};

export default function BillingPage() {
  return (
    <main className="marketing">
      <MarketingNav />
      <WorkspaceBilling />
      <MarketingFooter />
    </main>
  );
}
