"use client";

import Image from "next/image";
import { MouseEvent, useEffect, useState } from "react";
import BrandLockup from "@/components/brand-lockup";
import { useHomeHref } from "@/lib/home-href-client";
import { COMPARISONS, SCOPE_LINE } from "@/lib/public-site";

export function MarketingNav({
  onSectionLink,
}: {
  onSectionLink?: (event: MouseEvent<HTMLAnchorElement>, id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

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

  function sectionHref(id: string) {
    return onSectionLink ? `#${id}` : `/#${id}`;
  }

  function onSection(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (!onSectionLink) {
      setMenuOpen(false);
      return;
    }
    onSectionLink(event, id);
    setMenuOpen(false);
  }

  return (
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
        <a href={sectionHref("product")} onClick={(event) => onSection(event, "product")}>Product</a>
        <a href={sectionHref("roles")} onClick={(event) => onSection(event, "roles")}>Roles</a>
        <a href="/pricing">Pricing</a>
        <a href="/about">About</a>
        <a href={sectionHref("demo")} onClick={(event) => onSection(event, "demo")}>Demo</a>
        <a href="/login">Sign in</a>
        <a className="primary" href="/register">Start your workspace</a>
      </nav>
    </header>
  );
}

export function MarketingFooter() {
  const home = useHomeHref();
  return (
    <footer className="marketingFoot">
      <a className="brandHomeLink" href={home} aria-label="portonOS home">
        <Image
          src="/brand/portonos-wordmark.png"
          alt="portonOS"
          width={320}
          height={96}
          sizes="(max-width: 900px) 160px, 180px"
          srcSet="/brand/portonos-wordmark.png 320w"
        />
      </a>
      <span>For managers, owners, and invited vendors. Not a public marketplace. {SCOPE_LINE}</span>
      <nav className="marketingFootLinks" aria-label="Company">
        <a href="/pricing">Pricing</a>
        <a href="/about">About portonOS</a>
        <a href="/changelog">Changelog</a>
        <a href="/terms">Terms</a>
        <a href="/property-management-software">Small portfolios</a>
        {COMPARISONS.map((row) => (
          <a key={row.slug} href={`/vs/${row.slug}`}>
            {row.slug.endsWith("angi") ? "vs lead boards" : row.slug.endsWith("buildium") ? "vs Buildium" : "vs DoorLoop"}
          </a>
        ))}
        <a href="/vendors/signup">Vendor desk</a>
        <a href="/login">Sign in</a>
      </nav>
    </footer>
  );
}
