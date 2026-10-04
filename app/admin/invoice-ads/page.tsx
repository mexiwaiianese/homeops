import type { Metadata } from "next";
import InvoiceAdEditor from "@/components/invoice-ad-editor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invoice notes · portonOS",
  robots: { index: false, follow: false },
};

export default function AdminInvoiceAdsPage() {
  return (
    <main className="intakeShell">
      <InvoiceAdEditor />
    </main>
  );
}
