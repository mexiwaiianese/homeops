import type { Metadata } from "next";
import WorkspaceBilling from "@/components/workspace-billing";
import { MarketingFooter, MarketingNav } from "@/components/marketing-chrome";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Billing · portonOS",
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
