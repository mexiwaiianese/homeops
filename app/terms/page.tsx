import { MarketingFooter, MarketingNav } from "@/components/marketing-chrome";
import { CANCEL_COMMITMENT_LINE, MONEY_BACK_DAYS, SCOPE_LINE, VENDOR_PUBLIC_OFFER, dollars } from "@/lib/public-site";
import { pageMeta } from "@/lib/site-meta";

const title = "portonOS Terms";
const description = "Annual billing, the 30-day refund on the workspace invoice, and how to cancel. Applicant screening and card processing are not part of that refund.";

export const metadata = pageMeta(title, description, "/terms");

export default function TermsPage() {
  return (
    <main className="marketing">
      <MarketingNav />
      <article className="marketingArticle">
        <p className="eyebrow">Terms</p>
        <h1>Terms</h1>
        <p>
          portonOS is a workspace for your company. {SCOPE_LINE} It is not a public marketplace and not a pay-per-lead board.
        </p>

        <h2>Price</h2>
        <p>
          The workspace is billed once a year. There is no onboarding fee. The price, the properties included, and the $18 a year for each property past that are on the <a href="/pricing">pricing page</a>.
          Core&apos;s first year is 3 months at $25 and 9 months at $99. After that, Core is the regular annual price.
        </p>

        <h2>{MONEY_BACK_DAYS}-day refund</h2>
        <p>
          {CANCEL_COMMITMENT_LINE} The refund is that workspace invoice. It goes back through the payment processor to the card that paid it.
        </p>
        <p>
          The {MONEY_BACK_DAYS} days start when that invoice is paid. Cancel from <a href="/billing">Billing</a> in the workspace. You can leave a reason. The reason is optional.
        </p>
        <p>
          Inside the {MONEY_BACK_DAYS} days, the invoice is refunded and the workspace closes. After {MONEY_BACK_DAYS} days, the workspace stays open until the renewal date and then closes. It is not billed again, and that invoice is not refunded.
        </p>

        <h2>What the refund does not cover</h2>
        <p>
          Applicant screening is the screening partner&apos;s price, passed through, per adult. Enabling online payments on vendor invoices costs {dollars(VENDOR_PUBLIC_OFFER.paymentsAddonCents)} a month. Each card payment also incurs the payment processor&apos;s fee on top of that monthly add-on. Those charges are not part of the workspace refund.
        </p>

        <h2>Your records</h2>
        <p>
          Canceling does not delete the homes, owners, vendors, or work already in the workspace. The records stay until the workspace closes.
        </p>

        <h2>A sample workspace</h2>
        <p>
          The demo and the read-only peek are sample data. They are not billed, and canceling one does not refund anything.
        </p>
      </article>
      <MarketingFooter />
    </main>
  );
}
