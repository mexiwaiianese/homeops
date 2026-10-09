"use client";

import { usePathname } from "next/navigation";
import BrandLockup from "@/components/brand-lockup";
import NavToggle from "@/components/nav-toggle";
import { leavePersona } from "@/lib/persona-sign-out-client";
import VendorTour from "@/components/vendor-tour";

const links = [
  ["/vendors/desk", "Jobs"],
  ["/vendors/settings", "Bid settings"],
  ["/vendors/crew", "Crew"],
  ["/vendors/invoices", "Invoices"],
  ["/vendors/receivables", "Receivables"],
  ["/vendors/payouts", "Bank account"],
  ["/vendors/account", "Account"],
];

export default function VendorPortalFrame({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <main className="intakeShell vendorPortal">
      <section className="intakeCard jobCard">
        <div className="vendorDesk" data-menu>
        <div className="deskHead">
          <BrandLockup artwork="lockup" />
          <div className="deskHeadTools">
            <NavToggle />
            <button className="textBtn" onClick={() => void leavePersona("/api/vendors/session", "/vendors/login")}>Sign out</button>
          </div>
        </div>
        <nav className="vendorDeskNav">
          {links.map(([href, label]) => (
            <a key={href} href={href} data-tour-tab={href} className={pathname === href ? "active" : ""}>{label}</a>
          ))}
        </nav>
        </div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {lede && <p className="summary">{lede}</p>}
        {children}
        <VendorTour />
      </section>
    </main>
  );
}
