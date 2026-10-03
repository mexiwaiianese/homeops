"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import BrandLockup from "@/components/brand-lockup";
import type { DemoRole } from "@/lib/demo-access";

const ROLES: Array<{ id: DemoRole; title: string; lede: string }> = [
  { id: "manager", title: "Property manager", lede: "Your workspace: homes, maintenance, owner rules, and the vendors you already use." },
  { id: "owner", title: "Property owner", lede: "Cash, approvals, and a record of work on properties you own — without living in the inbox." },
  { id: "vendor", title: "Vendor", lede: "Awarded jobs and invited bids from managers who already have the home. No public lead board." },
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
    if (body.devLink) {
      setStatus("sent");
      setDevLink(body.devLink);
      setMessage("Email is not configured on this server, so the demo link was not emailed. Open it below.");
      return;
    }
    setStatus("sent");
    setMessage(`Check ${email} for a unique ${selected.title.toLowerCase()} demo link.`);
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
          <a className="primary" href="/register">Start your workspace</a>
        </nav>
      </header>

      <section className="marketingHero">
        <div>
          <p className="eyebrow">EVERYTHING BEHIND EVERY DOOR</p>
          <h1>Operations software for managers, owners, and the vendors they already trust.</h1>
          <p>
            portonOS is built for small property managers, landlords, and owner-operator trades — sold as a workspace for your company, not a public marketplace.
            Managers dispatch the work, owners see the money and the decisions, and vendors bid only on jobs they are invited to.
          </p>
          <div className="marketingActions">
            <a className="primary" href="#demo">See it as your role</a>
            <a className="secondaryBtn" href="/register">Start your workspace</a>
          </div>
        </div>
        <img className="marketingMark" src="/brand/portonos-mark.png" alt="" />
      </section>

      <section className="marketingGrid" id="product">
        <article>
          <p className="eyebrow">FOR MANAGERS</p>
          <h2>Run the portfolio from one desk.</h2>
          <p>Diagnose, authorize, dispatch, and keep a permanent record. Your approved vendors bid in a private network you control — credentials never sit on a public page.</p>
        </article>
        <article>
          <p className="eyebrow">FOR OWNERS</p>
          <h2>See the work and the money without chasing anyone.</h2>
          <p>Authority limits, reserves, and preferred vendors live on each home. You see what happened, what it cost, and why it needed your approval.</p>
        </article>
        <article>
          <p className="eyebrow">FOR VENDORS</p>
          <h2>Get invited to real jobs. Skip the lead mill.</h2>
          <p>Managers bring you onto their list. You bid from a private link, run awarded work from a vendor desk, and never pay to look eligible.</p>
        </article>
      </section>

      <section className="marketingRoles" id="roles">
        <p className="eyebrow">WHO IT IS FOR</p>
        <h2>One product. A door for each buyer.</h2>
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
          <p className="eyebrow">TRY YOUR VIEW</p>
          <h2>See portonOS as a {selected.title.toLowerCase()}.</h2>
          <p>Pick the persona that matches how you work. We email a private, one-person demo link — not a shared password — into a seeded workspace for that role.</p>
          <label>
            Work email
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" />
          </label>
          <fieldset className="marketingRolePick marketingRolePick-inline">
            <legend>I want to tour as</legend>
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
            {status === "sending" ? "Emailing…" : "Email my demo"}
          </button>
          {message && <div className={status === "error" ? "notice error" : "notice"}>{message}</div>}
          {devLink && <p className="summary">Open <a href={devLink}>your unique demo link</a>.</p>}
          {role === "vendor" && <p><a className="secondaryBtn" href="/vendors/signup">Register a New Vendor</a></p>}
        </form>
        <div className="marketingAside">
          <p className="eyebrow">START YOUR COMPANY</p>
          <h2>Ready to get to work?</h2>
          <p>
            Open a workspace for your management company, your rentals, or the shops you dispatch.
            You start empty — your homes, your owners, your vendors — and pick the package that matches how you operate.
          </p>
          <a className="primary" href="/register">Create your workspace</a>
          {role === "vendor" && <a className="secondaryBtn" href="/vendors/signup">Register a New Vendor</a>}
          <p><a href="/login">Already have access? Sign in</a></p>
        </div>
      </section>

      <footer className="marketingFoot">
        <img src="/brand/portonos-wordmark.png" alt="portonOS" />
        <span>For managers, owners, and invited vendors. Not a public marketplace.</span>
      </footer>
    </main>
  );
}
