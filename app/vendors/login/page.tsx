"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import BrandLockup from "@/components/brand-lockup";
import PersonaQuickLogin from "@/components/persona-login/persona-quick-login";
import { vendors as demoVendors } from "@/lib/vendor-demo";

export default function VendorLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const configured = Boolean(projectUrl && publishableKey);

  async function enterDemo(vendorId: string) {
    setBusy(true);
    const response = await fetch("/api/vendors/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorId }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not open the vendor desk."); return; }
    router.push("/vendors/desk");
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    if (!configured) { setMessage("Demo mode: pick a vendor company below. Live vendor accounts require Supabase."); return; }
    const supabase = createBrowserClient(projectUrl!, publishableKey!);
    const redirectTo = `${window.location.origin}/auth/callback?next=/vendors/desk`;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    setMessage(error ? error.message : "Check your email for the vendor desk link.");
  }

  return (
    <main className="intakeShell">
      <section className="intakeCard jobCard">
        <BrandLockup artwork="lockup" />
        <p className="eyebrow">VENDOR DESK</p>
        <h1>Sign in as your company.</h1>
        <p>The desk is where you set calendar and autobid rules, then open awarded jobs. Crews still use the no-login job link to record arrival, photos, and departure.</p>
        <form onSubmit={signIn}>
          <label>Work email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="dispatch@yourcompany.com" />
          </label>
          <button className="primary" type="submit" disabled={!email}>Email me a vendor sign-in link</button>
        </form>
        {message && <div className="notice">{message}</div>}
        <PersonaQuickLogin group="vendor" title="Open as a vendor">
          {!configured && (
            <>
              <div className="sectionTitle"><h3>Demo companies</h3><span>No password</span></div>
              <div className="credentialList">
                {demoVendors.map((vendor) => (
                  <div className="credential" key={vendor.id}>
                    <div>
                      <strong>{vendor.name}</strong>
                      <span>{vendor.trade} · {vendor.city}, {vendor.state}</span>
                    </div>
                    <button className="primary" disabled={busy} onClick={() => void enterDemo(vendor.id)}>Enter desk</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </PersonaQuickLogin>
        <a href="/login">Property manager sign-in</a>
        <a href="/tenant/login">Tenant portal sign-in</a>
      </section>
    </main>
  );
}
