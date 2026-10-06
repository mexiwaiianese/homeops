import { notFound } from "next/navigation";
import JsonLd from "@/components/json-ld";
import { MarketingFooter, MarketingNav } from "@/components/marketing-chrome";
import { COMPARISONS, comparisonBySlug } from "@/lib/public-site";
import { pageMeta } from "@/lib/site-meta";
import { faqLd } from "@/lib/structured-data";

export function generateStaticParams() {
  return COMPARISONS.map((row) => ({ slug: row.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = comparisonBySlug(slug);
  if (!page) return {};
  return pageMeta(page.title, page.description, `/vs/${page.slug}`);
}

export default async function ComparisonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = comparisonBySlug(slug);
  if (!page) notFound();
  return (
    <main className="marketing">
      <JsonLd data={faqLd(page.faq)} />
      <MarketingNav />
      <article className="marketingArticle">
        <p className="eyebrow">Comparison</p>
        <h1>{page.h1}</h1>
        <p>{page.lede}</p>
        <div className="pricingTableWrap">
          <table className="pricingTable">
            <caption>{page.columns[0]} and {page.columns[1]}</caption>
            <thead>
              <tr>
                <th scope="col"> </th>
                <th scope="col">{page.columns[0]}</th>
                <th scope="col">{page.columns[1]}</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{row.ours}</td>
                  <td>{row.theirs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2>Questions</h2>
        {page.faq.map((item) => (
          <details key={item.question}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
        <p><a className="primary" href="/pricing">See pricing</a></p>
      </article>
      <MarketingFooter />
    </main>
  );
}
