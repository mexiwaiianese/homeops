import type { Metadata } from "next";
import { notFound } from "next/navigation";
import OperatorGate from "@/components/operator-gate";
import PersonaLoginPanel from "@/components/persona-login/persona-login-panel";
import { isPersonaLoginEnabled } from "@/lib/persona-login";

// Persona switcher. The page itself requires the admin Google account.
// Renders a 404 whenever lib/persona-login/config.ts says the feature is off.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Persona login · HomeOps",
  robots: { index: false, follow: false },
};

export default async function PersonaLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!isPersonaLoginEnabled()) notFound();
  const { error } = await searchParams;
  return (
    <OperatorGate nextPath="/dev/personas" error={error} title="Persona switcher">
      <main className="intakeShell">
        <PersonaLoginPanel appName="HomeOps" signInHref="/login" />
      </main>
    </OperatorGate>
  );
}
