import type { Metadata } from "next";
import PersonaLoginPanel from "@/components/persona-login/persona-login-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Persona login · portonOS",
  robots: { index: false, follow: false },
};

export default function AdminPersonasPage() {
  return (
    <main className="intakeShell">
      <PersonaLoginPanel appName="portonOS" signInHref="/admin/login" />
    </main>
  );
}
