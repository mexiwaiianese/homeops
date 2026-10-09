"use client";

import { FormEvent, useEffect, useState } from "react";
import BrandLockup from "@/components/brand-lockup";
import PaymentTrustMark from "@/components/payment-trust-mark";
import { moneyCents, type SubscriptionPackage } from "@/lib/product-features";
import { ANNUAL_BILLING_LINE, CANCEL_COMMITMENT_LINE, OVERAGE_FRAME, OVERAGE_LINE, annualBillCents, dollars, packagePriceLine, packageRateLine, publicPackageById } from "@/lib/public-site";

export default function RegisterForm({ processorOn }: { processorOn: boolean }) {
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [packageId, setPackageId] = useState("operations");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");
  const [devLink, setDevLink] = useState("");
  const [stripe, setStripe] = useState(processorOn);
  const [overlap, setOverlap] = useState<{ blocked: boolean; message: string } | null>(null);

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
        const requested = params.get("package");
        const initial = rows.find((row) => row.id === requested)?.id
          || rows.find((row) => row.id === "operations")?.id
          || rows.find((row) => row.isDefault)?.id
          || rows[0]?.id;
        if (initial) setPackageId(initial);
      })
      .catch(() => undefined);
  }, []);

  const selected = packages.find((row) => row.id === packageId);
  const selectedOffer = publicPackageById(selected?.id);
  const chargeCents = selectedOffer?.listCents ?? selected?.monthlyCents ?? 0;

  async function submit(event: FormEvent, proceed = false) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");
    setDevLink("");
    if (!proceed) setOverlap(null);
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 25000);
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName, organizationName, packageId, proceed }),
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      const body = await response.json().catch(() => ({}));
      if (response.status === 409 && body.overlap) {
        setStatus("error");
        setOverlap({ blocked: Boolean(body.blocked), message: body.error || "This email overlaps an existing organization." });
        setMessage(body.error || "This email overlaps an existing organization.");
        return;
      }
      if (!response.ok) {
        setStatus("error");
        setOverlap(null);
        setMessage(body.error || "Could not start registration.");
        return;
      }
      setOverlap(null);
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
        <p>We email you a link. After you confirm, you start empty — your company, your people, your jobs. No sample data is copied in. {stripe ? "Paid plans take a card on the next step. The workspace is billed once a year." : "The payment processor is not turned on for this server, so this form emails a link and does not charge a card. The prices below are the published annual prices."}</p>
        <label>Your name<input required value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
        <label>Work email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Company name<input required value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} placeholder="Summit Property Group" /></label>
        <fieldset className="marketingRolePick">
          <legend>Package</legend>
          {packages.map((row) => (
            <label key={row.id} className="marketingRole">
              <input type="radio" name="package" checked={packageId === row.id} onChange={() => setPackageId(row.id)} />
              <span>
                <strong>{row.name}{publicPackageById(row.id)?.popular ? " · Most popular" : ""}</strong>
                <small>
                  {publicPackageById(row.id)
                    ? `${dollars(annualBillCents(publicPackageById(row.id)!, 1))}${publicPackageById(row.id)!.introCents ? " first year" : " a year"} · ${packageRateLine(publicPackageById(row.id)!)} · ${ANNUAL_BILLING_LINE} · ${publicPackageById(row.id)!.includedProperties} properties included`
                    : row.monthlyCents ? `${moneyCents(row.monthlyCents)} / month` : "Included"}
                  {" · "}{row.description}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
        {selectedOffer && (
          <p className="summary">
            {selectedOffer.includedProperties} properties included.
            {` ${selectedOffer.name} is ${packagePriceLine(selectedOffer)}.`}
            {" "}{OVERAGE_LINE} {OVERAGE_FRAME}
          </p>
        )}
        <button className="primary" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : chargeCents && stripe ? "Continue to payment" : "Email my workspace link"}
        </button>
        <p className="marketingTrust">{CANCEL_COMMITMENT_LINE} <a href="/terms">Terms</a>.</p>
        {stripe ? <PaymentTrustMark /> : null}
        <p className="marketingTrust"><a href="/pricing">See pricing</a>. {stripe ? "The card is taken on the next step." : "No card is charged on this server."}</p>
        {message && <div className={status === "error" ? "notice error" : "notice"}>{message}</div>}
        {overlap && !overlap.blocked && (
          <button className="secondaryBtn" type="button" disabled={status === "sending"} onClick={(event) => void submit(event, true)}>Proceed</button>
        )}
        {devLink && <p className="summary">Email is not configured locally. Open <a href={devLink}>your unique workspace link</a>.</p>}
        <p><a href="/">Back to portonOS</a></p>
      </form>
    </main>
  );
}
