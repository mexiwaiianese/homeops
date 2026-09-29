import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import InvoiceAdEditor from "@/components/invoice-ad-editor";
import { devToolsEnabled } from "@/lib/dev-login";
import { getAuthedContext } from "@/lib/backend";
import { isPersonaLoginEnabled } from "@/lib/persona-login";
import { getPersonaLoginConfig } from "@/lib/persona-login/config";
import { personaUnlockCookie, resolvePersonaLoginAccess, verifyUnlockCookie } from "@/lib/persona-login/gate";

// Operator editor for the note shown on the invoice link page. Same gate as /dev/personas.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invoice notes · HomeOps",
  robots: { index: false, follow: false },
};

export default async function InvoiceAdsPage() {
  if (!isPersonaLoginEnabled()) notFound();
  const unlocked = verifyUnlockCookie(getPersonaLoginConfig(), (await cookies()).get(personaUnlockCookie)?.value);
  const access = unlocked ? { allowed: true as const, reason: "" } : await resolvePersonaLoginAccess({
    currentUserEmail: async () => (await getAuthedContext()).user?.email ?? null,
  });
  // In development the email link is the way in, even when the persona switcher is open with no code.
  if (devToolsEnabled() && !unlocked) {
    return (
      <main className="intakeShell">
        <section className="intakeCard jobCard">
          <p className="eyebrow">OPERATOR TOOLS</p>
          <h1>Unlock first.</h1>
          <p>Email yourself a login link. It opens this editor and the persona switcher.</p>
          <a className="primary" href="/dev">Email yourself a login link</a>
        </section>
      </main>
    );
  }
  if (!access.allowed) {
    return (
      <main className="intakeShell">
        <section className="intakeCard jobCard">
          <p className="eyebrow">OPERATOR TOOLS</p>
          <h1>Unlock first.</h1>
          <p>{access.reason}</p>
          <a className="primary" href="/dev">Email yourself a login link</a>
        </section>
      </main>
    );
  }
  return (
    <main className="intakeShell">
      <InvoiceAdEditor />
    </main>
  );
}
