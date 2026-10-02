"use client";

import BrandLockup from "@/components/brand-lockup";
import AccessSignIn from "@/components/access-sign-in";

export default function VendorLoginPage() {
  return (
    <main className="intakeShell">
      <section className="intakeCard jobCard">
        <BrandLockup artwork="lockup" />
        <p className="eyebrow">VENDOR DESK</p>
        <h1>Sign in as your company.</h1>
        <p>Add crew, send invoices, and open awarded jobs. Crews still use a no-login job link.</p>
        <AccessSignIn
          heading="Email a sign-in link"
          lede="Use the email you registered with. The link works once."
          redirectTo="/vendors/desk"
          shouldCreateUser
          registerHref="/vendors/signup"
          registerLabel="Register a New Vendor"
        />
      </section>
    </main>
  );
}
