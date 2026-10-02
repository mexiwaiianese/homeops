import type { Metadata } from "next";
import { notFound } from "next/navigation";
import OperatorGate from "@/components/operator-gate";
import PersonaLoginPanel from "@/components/persona-login/persona-login-panel";
import { isPersonaLoginEnabled } from "@/lib/persona-login";

// Persona switcher. Google admin is off until portonos.com; until then this page
// is the unlock surface. 404 whenever lib/persona-login/config.ts says the feature is off.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Persona login · portonOS",
  robots: { index: false, follow: false },
};

export default async function PersonaLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (process.env.NODE_ENV === "production" || !isPersonaLoginEnabled()) notFound();
  const { error } = await searchParams;
  return (
    <OperatorGate nextPath="/dev/personas" error={error} title="Persona switcher">
      <main className="intakeShell">
        <PersonaLoginPanel appName="portonOS" signInHref="/login" />
      </main>
    </OperatorGate>
  );
}
