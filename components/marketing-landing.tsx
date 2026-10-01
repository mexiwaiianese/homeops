"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import BrandLockup from "@/components/brand-lockup";
import type { DemoRole } from "@/lib/demo-access";

const ROLES: Array<{ id: DemoRole; title: string; lede: string }> = [
  { id: "manager", title: "Property manager", lede: "The operations desk: homes, maintenance, vendors, and owner rules." },
  { id: "owner", title: "Property owner", lede: "Portfolio health, cash flow, and what required your approval." },
  { id: "vendor", title: "Vendor", lede: "Awarded jobs, open bids, and crew links — no public marketplace." },
];

export default function MarketingLanding({ demoError }: { demoError?: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DemoRole>("manager");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState(demoError || "");
  const [devLink, setDevLink] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const selected = useMemo(() => ROLES.find((row) => row.id === role) || ROLES[0], [role]);

  useEffect(() => {
    const close = () => setMenuOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onResize = () => {
      if (window.innerWidth > 900) close();
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  async function requestDemo(event: FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");
    setDevLink("");
    const response = await fetch("/api/demo/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus("error");
      setMessage(body.error || "Could not send the demo link.");
      return;
    }
    setStatus("sent");
    setMessage(`Check ${email} for a unique ${selected.title.toLowerCase()} demo link.`);
    if (body.devLink) setDevLink(body.devLink);
  }

  return (
    <main className="marketing">
      <header className={`marketingNav${menuOpen ? " menu-open" : ""}`}>
        <div className="marketingNavBar">
          <BrandLockup href="/" artwork="lockup" />
          <button
            type="button"
            className="navToggle"
            aria-expanded={menuOpen}
            aria-controls="marketing-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="navToggleBars" aria-hidden="true" />
          </button>
        </div>
        <nav id="marketing-menu" onClick={() => setMenuOpen(false)}>
          <a href="#product">Product</a>
          <a href="#roles">Roles</a>
          <a href="#demo">Demo</a>
          <a href="/login">Sign in</a>
          <a className="primary" href="/register">Start a workspace</a>
        </nav>
      </header>

      <section className="marketingHero">
        <div>
          <p className="eyebrow">EVERYTHING BEHIND EVERY DOOR</p>
          <h1>The operating system for the homes you already manage.</h1>
          <p>
            portonOS is an internal approved-vendor network and property operations desk — not a public marketplace.
            Managers dispatch, owners see the record, and vendors bid on work that already belongs to the portfolio.
          </p>
          <div className="marketingActions">
            <a className="primary" href="#demo">Email me a demo</a>
            <a className="secondaryBtn" href="/register">Register a blank workspace</a>
          </div>
        </div>
        <img className="marketingMark" src="/brand/portonos-mark.png" alt="" />
      </section>

      <section className="marketingGrid" id="product">
        <article>
          <p className="eyebrow">OPERATIONS</p>
          <h2>Maintenance that becomes a permanent record.</h2>
          <p>Diagnose, authorize, dispatch, and document. Reverse auctions stay among eligible vendors. Credentials never sit on a public page.</p>
        </article>
        <article>
          <p className="eyebrow">OWNERS</p>
          <h2>Rules the manager can actually execute.</h2>
          <p>Authority limits, reserves, and preferred vendors live on the home. Owners see what happened and why it needed approval.</p>
        </article>
        <article>
          <p className="eyebrow">VENDORS</p>
          <h2>Invite owner-operators. Skip the franchise board.</h2>
          <p>A private list, unique bid links, and a vendor desk for awarded work. Paid placement never changes organic eligibility.</p>
        </article>
      </section>

      <section className="marketingRoles" id="roles">
        <p className="eyebrow">THREE DOORS</p>
        <h2>One platform, a view for each role.</h2>
        <div className="marketingRoleGrid">
          {ROLES.map((row) => (
            <button
              key={row.id}
              type="button"
              className={role === row.id ? "marketingRole active" : "marketingRole"}
              onClick={() => setRole(row.id)}
            >
              <strong>{row.title}</strong>
              <span>{row.lede}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="marketingDemo" id="demo">
        <form className="marketingCard" onSubmit={(event) => void requestDemo(event)}>
          <p className="eyebrow">GUIDED DEMO</p>
          <h2>Email a unique link for the {selected.title.toLowerCase()} view.</h2>
          <p>Confirm your inbox. We send a hashed, one-person link — not a shared password — into the seeded demo for that role.</p>
          <label>
            Work email
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" />
          </label>
          <fieldset className="marketingRolePick marketingRolePick-inline">
            <legend>Open the demo as</legend>
            <div className="marketingRoleRow">
              {ROLES.map((row) => (
                <label key={row.id} className="miniCheck">
                  <input type="radio" name="role" checked={role === row.id} onChange={() => setRole(row.id)} />
                  <span>{row.title}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <button className="primary" type="submit" disabled={status === "sending"}>
            {status === "sending" ? "Sending…" : "Email my demo link"}
          </button>
          {message && <div className={status === "error" ? "notice error" : "notice"}>{message}</div>}
          {devLink && <p className="summary">Email is not configured locally. Open <a href={devLink}>your unique demo link</a>.</p>}
        </form>
        <div className="marketingAside">
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h2>Ready for a blank instance?</h2>
          <p>
            Full registration provisions an empty organization — no sample homes, no demo vendors.
            Choose a package now; platform admins can still turn features on or off per organization later.
          </p>
          <a className="primary" href="/register">Create a workspace</a>
          <p><a href="/login">Already have access? Sign in</a></p>
        </div>
      </section>

      <footer className="marketingFoot">
        <img src="/brand/portonos-wordmark.png" alt="portonOS" />
        <span>Internal operations. Not a public vendor marketplace.</span>
      </footer>
    </main>
  );
}
