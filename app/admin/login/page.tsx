import type { Metadata } from "next";
import BrandLockup from "@/components/brand-lockup";
import AdminLoginForm from "@/components/admin-login-form";
import { getOperatorAdmin } from "@/lib/operator-admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Platform admin · portonOS",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { allowed } = await getOperatorAdmin();

  return (
    <main className="intakeShell">
      <section className="intakeCard jobCard">
        <BrandLockup artwork="lockup" />
        <p className="eyebrow">PLATFORM ADMIN</p>
        <h1>Vendor recruitment.</h1>
        {allowed ? (
          <>
            <p>This browser is signed in as the platform admin. Recruitment is not available to owners or property managers.</p>
            <div className="devMenu">
              <a className="primary" href="/vendors">Open the vendor board</a>
            </div>
            <p>
              <a href="/dev/personas">Persona login</a>
              {" · "}
              <a href="/dev/invoice-ads">Invoice ads</a>
            </p>
          </>
        ) : (
          <>
            <p>Email a one-time link to the platform admin account. Owners can add vendors; only this login can run recruitment.</p>
            <AdminLoginForm error={error} />
          </>
        )}
        <p><a href="/login">Manager sign-in</a></p>
      </section>
    </main>
  );
}
