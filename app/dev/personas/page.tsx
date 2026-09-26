import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PersonaLoginPanel from "@/components/persona-login/persona-login-panel";
import { isPersonaLoginEnabled } from "@/lib/persona-login";

// Persona switcher for local development and authorized beta testers.
// Renders a 404 whenever lib/persona-login/config.ts says the feature is off.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Persona login · HomeOps",
  robots: { index: false, follow: false },
};

export default function PersonaLoginPage() {
  if (!isPersonaLoginEnabled()) notFound();
  return (
    <main className="intakeShell">
      <PersonaLoginPanel appName="HomeOps" signInHref="/login" />
    </main>
  );
}
