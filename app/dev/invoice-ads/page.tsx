import type { Metadata } from "next";
import { notFound } from "next/navigation";
import InvoiceAdEditor from "@/components/invoice-ad-editor";
import OperatorGate from "@/components/operator-gate";
import { isPersonaLoginEnabled } from "@/lib/persona-login";

// Operator editor for the note shown on the invoice link page. Same Google admin gate as /dev/personas.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invoice notes · HomeOps",
  robots: { index: false, follow: false },
};

export default async function InvoiceAdsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!isPersonaLoginEnabled()) notFound();
  const { error } = await searchParams;
  return (
    <OperatorGate nextPath="/dev/invoice-ads" error={error} title="Invoice notes">
      <main className="intakeShell">
        <InvoiceAdEditor />
      </main>
    </OperatorGate>
  );
}
