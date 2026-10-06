"use client";

import { FormEvent, MouseEvent, useLayoutEffect, useMemo, useState } from "react";
import FounderBlock from "@/components/founder-block";
import { MarketingFooter, MarketingNav } from "@/components/marketing-chrome";
import { HeroRoleShots, RoleScreens } from "@/components/product-shots";
import QuantityProof from "@/components/quantity-proof";
import StoryProof from "@/components/story-proof";
import type { DemoRole } from "@/lib/demo-access";
import { ACH_LINE, FAQ, FLAT_PRICE_LINE, OVERAGE_FRAME, OVERAGE_LINE, PUBLIC_PACKAGES, SCOPE_LINE, SPREADSHEET_LINE, packagePriceLine } from "@/lib/public-site";

const SECTION_IDS = ["product", "roles", "demo", "faq"] as const;

function scrollToMarketingSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 12;
  window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
}

const ROLES: Array<{ id: DemoRole; title: string; lede: string; galleryEyebrow: string; galleryTitle: string }> = [
  { id: "manager", title: "Property manager", lede: "Your workspace: homes, maintenance, owner rules, and the vendors you already use.", galleryEyebrow: "FOR MANAGERS", galleryTitle: "What needs you, the home, and the tenant." },
  { id: "owner", title: "Property owner", lede: "Cash, approvals, and a record of work on properties you own — without living in the inbox.", galleryEyebrow: "FOR OWNERS", galleryTitle: "Each home, and the monthly statement." },
  { id: "vendor", title: "Vendor", lede: "Awarded jobs and invited bids from managers who already have the home. No public lead board.", galleryEyebrow: "FOR VENDORS", galleryTitle: "The bid, and the invoice." },
];

export default function MarketingLanding({ demoError, focus }: { demoError?: string; focus?: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DemoRole>("manager");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState(demoError || "");
  const [devLink, setDevLink] = useState("");
  const selected = useMemo(() => ROLES.find((row) => row.id === role) || ROLES[0], [role]);

  useLayoutEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const target = SECTION_IDS.includes(hash as (typeof SECTION_IDS)[number])
      ? hash
      : focus && SECTION_IDS.includes(focus as (typeof SECTION_IDS)[number])
        ? focus
        : demoError
          ? "demo"
          : "";
    if (!target) return;
    scrollToMarketingSection(target);
  }, [demoError, focus]);

  function onSectionLink(event: MouseEvent<HTMLAnchorElement>, id: string) {
    event.preventDefault();
    event.stopPropagation();
    if (window.location.hash !== `#${id}`) window.history.pushState(null, "", `#${id}`);
    scrollToMarketingSection(id);
  }

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
      <MarketingNav onSectionLink={onSectionLink} />

      <section className="marketingHero">
        <div>
          <p className="eyebrow">Run the portfolio without firefighting</p>
          <h1>Operations software for managers, owners, and the vendors they already trust.</h1>
          <p>
            portonOS is built for small property managers, landlords, and owner-operator trades — sold as a workspace for your company, not a public marketplace.
            Managers dispatch the work, owners see the money and the decisions, and vendors bid only on jobs they are invited to.
            {" "}{SPREADSHEET_LINE} {SCOPE_LINE}
          </p>
          <div className="marketingActions">
            <a className="primary" href="#demo" onClick={(event) => onSectionLink(event, "demo")}>See it as your role</a>
            <a className="secondaryBtn" href="/register">Start your workspace</a>
            <a className="textLink" href="/pricing">See pricing</a>
          </div>
        </div>
        <HeroRoleShots />
      </section>

      <section className="marketingGrid" id="product">
        <article>
          <p className="eyebrow">FOR MANAGERS</p>
          <h2>Run the portfolio from one desk.</h2>
          <p>Diagnose, authorize, dispatch, and keep a permanent record. {SPREADSHEET_LINE} Your approved vendors bid in a private network you control — credentials never sit on a public page.</p>
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

      <QuantityProof />

      <section className="marketingRoles" id="roles">
        <p className="eyebrow">WHO IT IS FOR</p>
        <h2>One product. A door for each buyer.</h2>
        <p>You should feel in control of the portfolio, not stuck firefighting. Vendors on your list are the trades you already trust, not leads on a board.</p>
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

      <StoryProof />

      <section className="marketingDemo" id="demo">
        <form className="marketingCard" onSubmit={(event) => void requestDemo(event)}>
          <p className="eyebrow">TRY YOUR VIEW</p>
          <h2>See portonOS as a {selected.title.toLowerCase()}.</h2>
          <p>Pick the persona that matches how you work. We email a private, one-person demo link — not a shared password — into a seeded workspace for that role. The link arrives in under 2 minutes. No sales call. It expires in 7 days.</p>
          <label>
            Work email
            <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" autoComplete="email" />
            <small className="fieldNote">We use this email only to send your demo link. We do not sell it.</small>
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
          <p className="marketingTrust">No credit card required to tour.</p>
          {message && <div className={status === "error" ? "notice error" : "notice"}>{message}</div>}
          {devLink && <p className="summary">Open <a href={devLink}>your unique demo link</a>.</p>}
          {role === "vendor" && <p><a className="secondaryBtn" href="/vendors/signup">Register a New Vendor</a></p>}
        </form>
        <div className="marketingAside">
          <p className="eyebrow">START YOUR COMPANY</p>
          <h2>Ready to get to work?</h2>
          <p>
            Open a workspace for your management company, your rentals, or the shops you dispatch.
            You start empty — your homes, your owners, your vendors.
            Core is {packagePriceLine(PUBLIC_PACKAGES[0])} and includes {PUBLIC_PACKAGES[0].includedProperties} properties.
            Operations is {packagePriceLine(PUBLIC_PACKAGES[1])} and includes {PUBLIC_PACKAGES[1].includedProperties} properties.
            Portfolio is {packagePriceLine(PUBLIC_PACKAGES[2])} and includes {PUBLIC_PACKAGES[2].includedProperties} properties.
            {ACH_LINE} {OVERAGE_FRAME} {OVERAGE_LINE} {FLAT_PRICE_LINE}
          </p>
          <a className="primary" href="/register">Create your workspace</a>
          <p className="marketingTrust">Cancel anytime. <a href="/pricing">See pricing</a>. Paid workspaces are billed through Stripe.</p>
          {role === "vendor" && <a className="secondaryBtn" href="/vendors/signup">Register a New Vendor</a>}
          <p><a href="/login">Already have access? Sign in</a></p>
        </div>
      </section>

      <section className="marketingRoleShots" aria-live="polite" aria-label={`${selected.title} screens`}>
        <p className="eyebrow">{selected.galleryEyebrow}</p>
        <h2>{selected.galleryTitle}</h2>
        <RoleScreens role={role} />
      </section>

      <section className="marketingFaq" id="faq">
        <h2>Questions</h2>
        {FAQ.map((item) => (
          <details key={item.question}>
            <summary>{item.question}</summary>
            <p>
              {item.answer}
              {item.question === "What does it cost?" ? <> Full list on the <a href="/pricing">pricing page</a>.</> : null}
            </p>
          </details>
        ))}
      </section>

      <FounderBlock />
      <MarketingFooter />
    </main>
  );
}
