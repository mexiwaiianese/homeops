import { MarketingFooter, MarketingNav } from "@/components/marketing-chrome";
import { SCOPE_LINE } from "@/lib/public-site";
import { pageMeta } from "@/lib/site-meta";

const title = "portonOS End User License Agreement";
const description = "The license to use portonOS. What a workspace includes, what you may not do with it, and who owns the records you put in it.";

export const metadata = pageMeta(title, description, "/eula");

export default function EulaPage() {
  return (
    <main className="marketing">
      <MarketingNav />
      <article className="marketingArticle">
        <p className="eyebrow">License</p>
        <h1>End user license agreement</h1>
        <p>Effective October 13, 2026.</p>
        <p>
          This agreement is between you and DBX DEV. It licenses the portonOS software. Price, the 30-day refund, and how to cancel are on the <a href="/terms">terms page</a>.
        </p>
        <p>
          portonOS is a workspace for your company. {SCOPE_LINE} It is not a public marketplace and not a pay-per-lead board. Starting a workspace, registering a vendor desk, signing in, or using an invite accepts this agreement.
        </p>

        <h2>The license</h2>
        <p>
          DBX DEV grants the company that opens a workspace a non-exclusive, non-transferable license to use the hosted portonOS service for that company&apos;s own property operations, while the workspace is open. Staff, owners, vendors, applicants, and other people you invite may use it only inside the access you give them. A vendor who opens a vendor desk gets the same kind of license for that desk.
        </p>
        <p>
          The license is for the hosted service. It is not a sale of the software, and it does not include the source code.
        </p>

        <h2>Your account</h2>
        <p>
          The person who starts the workspace accepts this agreement for the company named at signup. That company is responsible for the people it invites and for keeping sign-in links with the people they were sent to.
        </p>
        <p>
          One workspace is for one company. Do not share it with another company, resell seats, or let someone else run their portfolio inside your login.
        </p>

        <h2>What you may not do</h2>
        <p>
          You may not copy, resell, sublicense, or rent the software or a workspace. You may not reverse engineer, scrape, or probe the service, except where the law does not allow that limit. You may not use the service to build a competing product, or to pull another company&apos;s records.
        </p>
        <p>
          You may not upload unlawful material, or use the service to defraud, harass, or break housing, credit, or privacy law. You may not misstate a screening result, a payment, or an invoice.
        </p>

        <h2>Your records</h2>
        <p>
          You own the homes, people, vendors, leases, invoices, and other records you put in the workspace. You grant DBX DEV a license to host, back up, and show those records so the workspace can run, including to the people you invite.
        </p>
        <p>
          We store the work email you give us and the records you put in the workspace so the desk can run. We do not sell that data. Vendor credentials never sit on a public page. The <a href="/privacy">privacy page</a> says what is stored, who can see it, and how long it stays.
        </p>
        <p>
          Canceling does not delete those records. They stay until the workspace closes, as described on the <a href="/terms">terms page</a>.
        </p>

        <h2>Screening and payments</h2>
        <p>
          Applicant screening, when it is turned on, is run by the screening partner. The report is the partner&apos;s product, at the partner&apos;s price. You make the leasing decision. portonOS does not decide who to rent to, and it does not send an adverse-action notice.
        </p>
        <p>
          Card and bank payments go through the payment processor. That processor&apos;s terms apply to the payment itself. Enabling online payments, and the processor&apos;s fee, are separate from this license, as described on the <a href="/terms">terms page</a>.
        </p>

        <h2>What portonOS is not</h2>
        <p>
          portonOS is operations software. It is not your lawyer, accountant, property manager of record, broker, or consumer reporting agency. Reports in the workspace are the records you keep. They are not legal, tax, or fair-housing advice. The demo and the read-only peek are sample data.
        </p>

        <h2>Our software</h2>
        <p>
          DBX DEV owns portonOS, including the software, the design, and the portonOS name. Feedback you send may be used to improve the product. We have no duty to pay for that feedback or to keep it confidential.
        </p>

        <h2>Availability</h2>
        <p>
          We may change or retire a feature. A paid workspace stays available through the period already paid, unless we suspend it for abuse, a security problem, or a break of this agreement. Billing, refunds, and closing a workspace you cancel are on the <a href="/terms">terms page</a>.
        </p>

        <h2>Disclaimer</h2>
        <p>
          The service is provided as is. DBX DEV disclaims warranties of merchantability, fitness for a particular purpose, and non-infringement, and does not warrant that the service will be uninterrupted or error-free, except where the law does not allow that disclaimer.
        </p>

        <h2>Limit of liability</h2>
        <p>
          To the extent the law allows, DBX DEV is not liable for lost rent, lost profits, lost records, or other indirect damages. Our total liability for a claim arising from the service is limited to the amount you paid DBX DEV for the workspace or vendor desk in the twelve months before the claim.
        </p>
        <p>
          This limit does not apply where the law does not allow it, including liability that cannot be waived.
        </p>

        <h2>Ending the license</h2>
        <p>
          The license ends when the workspace or vendor desk closes. You can cancel as described on the <a href="/terms">terms page</a>. We can suspend access if you break this agreement, do not pay, or use the service in a way that harms other customers or the service. The sections on your records, our software, the disclaimer, and the limit of liability still apply after the license ends.
        </p>

        <h2>Law</h2>
        <p>
          Utah law governs this agreement, without regard to conflict-of-law rules. Disputes are brought in the state or federal courts in Utah.
        </p>
        <p>
          If a court holds one part unenforceable, the rest stays in effect. This agreement and the <a href="/terms">terms page</a> are the license and the billing terms for the software. If they conflict on price, refunds, or canceling, the terms page controls.
        </p>
      </article>
      <MarketingFooter />
    </main>
  );
}
