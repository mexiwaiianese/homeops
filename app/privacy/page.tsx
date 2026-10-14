import { MarketingFooter, MarketingNav } from "@/components/marketing-chrome";
import { SCOPE_LINE } from "@/lib/public-site";
import { pageMeta } from "@/lib/site-meta";

const title = "portonOS Privacy";
const description = "What portonOS stores, who can see a workspace, and how long those records stay. We do not sell that data.";

export const metadata = pageMeta(title, description, "/privacy");

export default function PrivacyPage() {
  return (
    <main className="marketing">
      <MarketingNav />
      <article className="marketingArticle">
        <p className="eyebrow">Privacy</p>
        <h1>Privacy</h1>
        <p>Effective October 14, 2026.</p>
        <p>
          This notice is from DBX DEV, for the portonOS software. Price, the 30-day refund, and how to cancel are on the <a href="/terms">terms page</a>. The license is the <a href="/eula">end user license agreement</a>.
        </p>
        <p>
          portonOS is a workspace for your company. {SCOPE_LINE} It is not a public marketplace and not a pay-per-lead board.
        </p>

        <h2>What we store</h2>
        <p>
          We store the work email you give us and the records you put in the workspace so the desk can run. That includes the company name, the homes, the people, the vendors, the leases, the invoices, and the work.
        </p>
        <p>
          Vendor credentials never sit on a public page. People you invite see only the access you give them.
        </p>
        <p>We do not sell that data.</p>

        <h2>Sign-in</h2>
        <p>
          Signing in uses a link sent to the email on the account. The browser keeps a cookie so you stay signed in. The demo and the read-only peek use a cookie for that visit. Those cookies run the session. They are not advertising cookies.
        </p>

        <h2>Payments</h2>
        <p>
          Card and bank details stay with the payment processor. portonOS keeps the receipt and the amount. The processor&apos;s own terms cover the payment itself.
        </p>

        <h2>Applicant screening</h2>
        <p>
          When screening is turned on, the screening partner runs the credit, criminal, and eviction report. The report is the partner&apos;s product. Leave Social Security numbers off the portonOS application. You make the leasing decision. portonOS does not decide who to rent to.
        </p>

        <h2>QuickBooks</h2>
        <p>
          If you connect QuickBooks, cash activity is copied both ways between that company file and the workspace. Disconnecting stops the copy. Lines already copied stay in the books.
        </p>

        <h2>Pages on this site</h2>
        <p>
          We record which public pages are opened, so we can see what people use. We do not sell that record.
        </p>
        <h2>Invoice recipient research and offers</h2>
        <p>
          When a vendor adds an invoice client, we may use the client company name and work-email domain to search public sources for the property-management platform that company uses. We store the provider, supporting public-source links, research date, and invoice offer copy. We do not treat an unsupported search result as a match. Personalized invoice offer links record the invoice marketing source, placement, click, registration, and checkout start so the offer can be attributed.
        </p>

        <h2>How long</h2>
        <p>
          Canceling does not delete the records. They stay until the workspace closes, as described on the <a href="/terms">terms page</a>. The demo and the read-only peek are sample data.
        </p>

        <h2>Questions</h2>
        <p>
          Questions about the records in a workspace go to DBX DEV from the email on that workspace.
        </p>
      </article>
      <MarketingFooter />
    </main>
  );
}
