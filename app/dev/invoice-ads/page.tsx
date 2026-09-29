import type { Metadata } from "next";
import { notFound } from "next/navigation";
import InvoiceAdEditor from "@/components/invoice-ad-editor";
import OperatorGate from "@/components/operator-gate";
import { getAuthedContext } from "@/lib/backend";
import { googleAuthEnabled } from "@/lib/google-auth";
import { isPersonaLoginEnabled } from "@/lib/persona-login";
import { resolvePersonaLoginAccess } from "@/lib/persona-login/gate";

// Operator editor for the note shown on the invoice link page.
// Google admin when that sign-in is enabled; otherwise the same unlock as /dev/personas.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invoice notes · portonOS",
  robots: { index: false, follow: false },
};

export default async function InvoiceAdsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!isPersonaLoginEnabled()) notFound();
  const { error } = await searchParams;
  if (!googleAuthEnabled) {
    const access = await resolvePersonaLoginAccess({
      currentUserEmail: async () => (await getAuthedContext()).user?.email ?? null,
    });
    if (!access.allowed) {
      return (
        <main className="intakeShell">
          <section className="intakeCard jobCard">
            <p className="eyebrow">OPERATOR TOOLS</p>
            <h1>Unlock first.</h1>
            <p>{access.reason}</p>
            <a className="primary" href="/dev/personas">Open the persona switcher</a>
          </section>
        </main>
      );
    }
  }
  return (
    <OperatorGate nextPath="/dev/invoice-ads" error={error} title="Invoice notes">
      <main className="intakeShell">
        <InvoiceAdEditor />
      </main>
    </OperatorGate>
  );
}
