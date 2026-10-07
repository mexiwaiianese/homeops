import { ContentBreadcrumbs, RelatedContent } from "@/components/content-navigation";
import { MarketingFooter, MarketingNav } from "@/components/marketing-chrome";
import { CHANGELOG, founderByline } from "@/lib/public-site";
import { pageMeta } from "@/lib/site-meta";

const title = "portonOS Changelog: What Shipped";
const description = "Dated notes on what shipped in portonOS: the private demo link, owner and tenant portals, invited bids, listings, rent, and books.";

export const metadata = pageMeta(title, description, "/changelog");

export default function ChangelogPage() {
  return (
    <main className="marketing">
      <MarketingNav />
      <article className="marketingArticle">
        <ContentBreadcrumbs items={[{ href: "/changelog", label: "Changelog" }]} />
        <p className="eyebrow">Changelog</p>
        <h1>portonOS changelog: what shipped</h1>
        <p>Dates are the days the work landed in the product. No customer names are attached.</p>
        <ol className="changelog">
          {CHANGELOG.map((entry) => (
            <li key={entry.date + entry.title}>
              <time dateTime={entry.date}>{entry.date}</time>
              <p className="changelogByline">{founderByline}</p>
              <h2>{entry.title}</h2>
              <p>{entry.body}</p>
            </li>
          ))}
        </ol>
        <RelatedContent links={[
          { href: "/resources", label: "Resources", description: "Browse product guidance and comparisons." },
          { href: "/about", label: "About portonOS", description: "Why the product exists." },
          { href: "/pricing", label: "Pricing", description: "See plans, included properties, and overage pricing." },
        ]} />
      </article>
      <MarketingFooter />
    </main>
  );
}
