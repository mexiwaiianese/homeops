import type { Metadata } from "next";
import JsonLd from "@/components/json-ld";
import { MarketingFooter, MarketingNav } from "@/components/marketing-chrome";
import PricingBoard from "@/components/pricing-board";
import StoryProof from "@/components/story-proof";
import { ACH_LINE, FLAT_PRICE_LINE, OVERAGE_FRAME } from "@/lib/public-site";
import { pageMeta } from "@/lib/site-meta";
import { productLd } from "@/lib/structured-data";

const title = "portonOS Pricing: Plans for Small Property Managers";
const description = "See portonOS pricing for small property managers: annual plans for 25, 75, or 250 properties, free ACH, and clear property overage costs.";

export const metadata: Metadata = pageMeta(title, description, "/pricing");

export default function PricingPage() {
  return (
    <main className="marketing">
      <JsonLd data={productLd()} />
      <MarketingNav />
      <article className="marketingArticle">
        <p className="eyebrow">Pricing</p>
        <h1>portonOS pricing for small property managers</h1>
        <p>{FLAT_PRICE_LINE} {ACH_LINE} {OVERAGE_FRAME} Operations is the package most desks start on.</p>
        <PricingBoard />
        <StoryProof />
      </article>
      <MarketingFooter />
    </main>
  );
}
