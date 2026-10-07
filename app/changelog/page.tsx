import { MarketingFooter, MarketingNav } from "@/components/marketing-chrome";
import { CHANGELOG, founderByline } from "@/lib/public-site";
import { pageMeta } from "@/lib/site-meta";

const title = "portonOS Changelog for Small Managers";
const description = "Dated notes on what shipped in portonOS: the private demo link, owner and tenant portals, invited bids, listings, rent, and books.";

export const metadata = pageMeta(title, description, "/changelog");

export default function ChangelogPage() {
  return (
    <main className="marketing">
      <MarketingNav />
      <article className="marketingArticle">
        <p className="eyebrow">Changelog</p>
        <h1>What shipped</h1>
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
      </article>
      <MarketingFooter />
    </main>
  );
}
