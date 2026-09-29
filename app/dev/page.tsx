import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import BrandLockup from "@/components/brand-lockup";
import DevLoginForm from "@/components/dev-login-form";
import { devToolsEnabled } from "@/lib/dev-login";
import { getPersonaLoginConfig } from "@/lib/persona-login/config";
import { personaUnlockCookie, verifyUnlockCookie } from "@/lib/persona-login/gate";

// Front door for operator tools. Development only. A login link emailed to an allowed address
// sets the same unlock the persona switcher and the invoice-note editor already check.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Operator tools · portonOS",
  robots: { index: false, follow: false },
};

export default async function DevHomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!devToolsEnabled()) notFound();
  const { error } = await searchParams;
  const unlocked = verifyUnlockCookie(getPersonaLoginConfig(), (await cookies()).get(personaUnlockCookie)?.value);

  return (
    <main className="intakeShell">
      <section className="intakeCard jobCard">
        <BrandLockup artwork="lockup" />
        <p className="eyebrow">OPERATOR TOOLS</p>
        <h1>Dev tools.</h1>
        {unlocked ? (
          <>
            <p>You are signed in on this browser. These pages are not available in production.</p>
            <div className="devMenu">
              <a className="primary" href="/dev/personas">Persona switcher</a>
              <a className="primary" href="/dev/invoice-ads">Invoice notes</a>
            </div>
          </>
        ) : (
          <>
            <p>Email yourself a login link. It works once, expires in 20 minutes, and opens both tools.</p>
            <DevLoginForm error={error} />
          </>
        )}
      </section>
    </main>
  );
}
