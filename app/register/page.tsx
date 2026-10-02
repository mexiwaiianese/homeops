"use client";

import { FormEvent, useEffect, useState } from "react";
import BrandLockup from "@/components/brand-lockup";
import { moneyCents, type SubscriptionPackage } from "@/lib/product-features";

export default function RegisterPage() {
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [packageId, setPackageId] = useState("core");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [devLink, setDevLink] = useState("");
  const [stripe, setStripe] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("canceled")) setMessage("Checkout was canceled. You can try again.");
    if (params.get("error")) setMessage(params.get("error") || "");
    fetch("/api/register")
      .then((r) => r.json())
      .then((body) => {
        const rows = (body.packages || []) as SubscriptionPackage[];
        setPackages(rows);
        setStripe(Boolean(body.stripe));
        const initial = rows.find((row) => row.isDefault)?.id || rows[0]?.id;
        if (initial) setPackageId(initial);
      })
      .catch(() => undefined);
  }, []);

  const selected = packages.find((row) => row.id === packageId);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");
    setDevLink("");
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 25000);
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName, organizationName, packageId }),
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus("error");
        setMessage(body.error || "Could not start registration.");
        return;
      }
      if (body.checkoutUrl) {
        window.location.assign(body.checkoutUrl);
        return;
      }
      setStatus("sent");
      setMessage(`Check ${email}. Open the link to start your empty workspace.`);
      if (body.devLink) setDevLink(body.devLink);
    } catch {
      setStatus("error");
      setMessage("Could not reach the server. Wait a minute and try again.");
    }
  }

  return (
    <main className="intakeShell">
      <form className="intakeCard jobCard marketingCard" onSubmit={(event) => void submit(event)}>
        <BrandLockup artwork="lockup" />
        <p className="eyebrow">NEW WORKSPACE</p>
        <h1>Create your workspace.</h1>
        <p>We email you a link. After you confirm, you start empty — your company, your people, your jobs. No sample data is copied in{stripe ? ". Paid plans take a card when billing is on." : "."}</p>
        <label>Your name<input required value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
        <label>Work email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Company name<input required value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} placeholder="Summit Property Group" /></label>
        <fieldset className="marketingRolePick">
          <legend>Package</legend>
          {packages.map((row) => (
            <label key={row.id} className="marketingRole">
              <input type="radio" name="package" checked={packageId === row.id} onChange={() => setPackageId(row.id)} />
              <span>
                <strong>{row.name}</strong>
                <small>{row.monthlyCents ? `${moneyCents(row.monthlyCents)} / month` : "Included"} · {row.description}</small>
              </span>
            </label>
          ))}
        </fieldset>
        {selected && !selected.monthlyCents && <p className="summary">Core starts as soon as you confirm your email. Paid plans will ask for a card when billing is turned on.</p>}
          <button className="primary" type="submit" disabled={status === "sending"}>
            {status === "sending" ? "Sending…" : selected && selected.monthlyCents && stripe ? "Continue to payment" : "Email my workspace link"}
          </button>
        {message && <div className={status === "error" ? "notice error" : "notice"}>{message}</div>}
        {devLink && <p className="summary">Email is not configured locally. Open <a href={devLink}>your unique workspace link</a>.</p>}
        <p><a href="/">Back to portonOS</a></p>
      </form>
    </main>
  );
}
