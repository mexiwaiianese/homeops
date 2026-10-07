import { ContentBreadcrumbs, RelatedContent } from "@/components/content-navigation";
import { MarketingFooter, MarketingNav } from "@/components/marketing-chrome";
import { pageMeta } from "@/lib/site-meta";

const title = "Property Management Resources | portonOS";
const description = "Guides and comparisons for small property managers evaluating software, pricing, vendor workflows, and day-to-day portfolio operations.";

export const metadata = pageMeta(title, description, "/resources");

const links = [
  {
    href: "/property-management-software",
    label: "Property management software for small portfolios",
    description: "What portonOS covers for managers, owners, and invited vendors.",
  },
  {
    href: "/vs/portonos-vs-buildium",
    label: "portonOS vs Buildium",
    description: "Compare published pricing, included properties, and operating workflows.",
  },
  {
    href: "/vs/portonos-vs-doorloop",
    label: "portonOS vs DoorLoop",
    description: "Compare property limits, annual pricing, and vendor workflows.",
  },
  {
    href: "/vs/portonos-vs-angi",
    label: "portonOS vs lead boards",
    description: "Why an invited vendor list is different from paying for public leads.",
  },
  {
    href: "/changelog",
    label: "Product changelog",
    description: "Dated notes on what has shipped.",
  },
];

export default function ResourcesPage() {
  return (
    <main className="marketing">
      <MarketingNav />
      <article className="marketingArticle">
        <ContentBreadcrumbs items={[{ href: "/resources", label: "Resources" }]} />
        <p className="eyebrow">Resources</p>
        <h1>Property management resources for small portfolios</h1>
        <p>
          The portonOS resource hub is a direct path to product guidance, pricing comparisons, and the workflows small property managers use to run a portfolio.
        </p>
        <RelatedContent links={links} />
      </article>
      <MarketingFooter />
    </main>
  );
}
