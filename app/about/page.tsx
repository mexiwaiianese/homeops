import FounderBlock from "@/components/founder-block";
import JsonLd from "@/components/json-ld";
import { MarketingFooter, MarketingNav } from "@/components/marketing-chrome";
import { FAQ, SCOPE_LINE } from "@/lib/public-site";
import { pageMeta } from "@/lib/site-meta";
import { faqLd } from "@/lib/structured-data";

const title = "About portonOS";
const description = "Why portonOS exists, and answers on price, privacy, screening, vendors, and canceling. A workspace for your company, not a public marketplace.";

export const metadata = pageMeta(title, description, "/about");

export default function AboutPage() {
  return (
    <main className="marketing">
      <JsonLd data={faqLd(FAQ)} />
      <MarketingNav />
      <article className="marketingArticle">
        <p className="eyebrow">About</p>
        <h1>About portonOS</h1>
        <p className="aboutLede">A workspace for your company, not a public marketplace.</p>
        <p>
          portonOS is operations software for small property managers, landlords, and owner-operator trades.
          Managers dispatch the work, owners see the money and the decisions, and vendors bid only on jobs they are invited to.
          {" "}{SCOPE_LINE}
        </p>
        <FounderBlock />
      </article>
      <section className="marketingFaq" id="faq">
        <h2>Questions</h2>
        {FAQ.map((item) => (
          <details key={item.question}>
            <summary>{item.question}</summary>
            <p>
              {item.answer}
              {item.question === "What does it cost?" ? <> Full list on the <a href="/pricing">pricing page</a>.</> : null}
              {item.question === "Can I cancel?" ? <> Full terms on the <a href="/terms">terms page</a>.</> : null}
            </p>
          </details>
        ))}
      </section>
      <MarketingFooter />
    </main>
  );
}
