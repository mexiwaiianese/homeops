import FounderBlock from "@/components/founder-block";
import { MarketingFooter, MarketingNav } from "@/components/marketing-chrome";
import { SCOPE_LINE } from "@/lib/public-site";
import { pageMeta } from "@/lib/site-meta";

const title = "About portonOS for Small Property Managers";
const description = "portonOS is operations software for small property managers, landlords, and owner-operator trades. A workspace for your company, not a public marketplace.";

export const metadata = pageMeta(title, description, "/about");

export default function AboutPage() {
  return (
    <main className="marketing">
      <MarketingNav />
      <article className="marketingArticle">
        <p className="eyebrow">About</p>
        <h1>A workspace for your company, not a public marketplace.</h1>
        <p>
          portonOS is operations software for small property managers, landlords, and owner-operator trades.
          Managers dispatch the work, owners see the money and the decisions, and vendors bid only on jobs they are invited to.
          {" "}{SCOPE_LINE}
        </p>
        <FounderBlock />
      </article>
      <MarketingFooter />
    </main>
  );
}
