import type { Metadata } from "next";
import JsonLd from "@/components/json-ld";
import { MarketingFooter, MarketingNav } from "@/components/marketing-chrome";
import PricingBoard from "@/components/pricing-board";
import StoryProof from "@/components/story-proof";
import { ACH_LINE, FLAT_PRICE_LINE, OVERAGE_FRAME } from "@/lib/public-site";
import { pageMeta } from "@/lib/site-meta";
import { productLd } from "@/lib/structured-data";

const title = "portonOS Pricing for Small Property Managers";
const description = "Billed once a year. Core is $966 the first year (3 months at $25 and 9 months at $99) for 25 properties, then $1,188 a year. Operations is $1,788 a year for 75 properties. Portfolio is $3,588 a year for 250 properties. Each property past that is $18 a year, prorated to the renewal date if added mid-year. Free ACH on included properties.";

export const metadata: Metadata = pageMeta(title, description, "/pricing");

export default function PricingPage() {
  return (
    <main className="marketing">
      <JsonLd data={productLd()} />
      <MarketingNav />
      <article className="marketingArticle">
        <p className="eyebrow">Pricing</p>
        <h1>One flat price for the workspace.</h1>
        <p>{FLAT_PRICE_LINE} {ACH_LINE} {OVERAGE_FRAME} Operations is the package most desks start on.</p>
        <PricingBoard />
        <StoryProof />
      </article>
      <MarketingFooter />
    </main>
  );
}
