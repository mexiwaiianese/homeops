import JsonLd from "@/components/json-ld";
import { MarketingFooter, MarketingNav } from "@/components/marketing-chrome";
import PricingBoard from "@/components/pricing-board";
import { ManagerInboxShot, OwnerShot, VendorShot } from "@/components/product-shots";
import { SCOPE_LINE } from "@/lib/public-site";
import { pageMeta } from "@/lib/site-meta";
import { faqLd } from "@/lib/structured-data";

const title = "Property Management Software for Small Portfolios";
const description = "Property management software for small portfolios. One workspace for maintenance, owner reports, and invited vendors. Flat annual price. Not a 10,000-unit suite and not a public marketplace.";

const FAQ = [
  {
    question: "Who is this for?",
    answer: `Small property managers, landlords, and owner-operator trades. ${SCOPE_LINE} It is not a public marketplace and not a pay-per-lead board.`,
  },
  {
    question: "How hard is it to learn?",
    answer: "You confirm a work email and open an empty workspace: your homes, your owners, your vendors. The demo is that same desk with sample homes, so you are not learning a second product after you start. There is no sales call.",
  },
  {
    question: "What if we switch and the team does not use it?",
    answer: "The desk is where the work already goes: dispatch, approvals, and the record, instead of email threads and spreadsheets. If it does not fit, cancel in the workspace within 30 days of the invoice and we refund it. After that, cancel before the next annual invoice and you are not billed again. There is no onboarding fee.",
  },
  {
    question: "How do the fees compare?",
    answer: "One flat price. The per-transaction fees and $99 bank setups rivals charge are included here. No per-lead charge and no onboarding fee. Applicant screening, on Operations and Portfolio, is still the screening partner's price per adult. See the cards below for the annual bill.",
  },
];

export const metadata = pageMeta(title, description, "/property-management-software");

export default function SmallPortfolioSoftwarePage() {
  return (
    <main className="marketing">
      <JsonLd data={faqLd(FAQ)} />
      <MarketingNav />
      <article className="marketingArticle">
        <p className="eyebrow">For small portfolios</p>
        <h1>Property management software for small portfolios</h1>
        <p>
          portonOS is the desk for a small portfolio: maintenance, owner reports, and the vendors you already trust.
          {" "}{SCOPE_LINE} It is a workspace for your company, not a public marketplace.
        </p>
        <h2>The same screens as the homepage</h2>
        <div className="categoryShots">
          <ManagerInboxShot />
          <OwnerShot />
          <VendorShot />
        </div>
        <h2>Questions</h2>
        {FAQ.map((item) => (
          <details key={item.question}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </article>
      <section className="marketingArticle">
        <h2>Pricing</h2>
        <PricingBoard />
      </section>
      <MarketingFooter />
    </main>
  );
}
