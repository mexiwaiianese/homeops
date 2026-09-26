"use client";

import { usePathname } from "next/navigation";
import BrandLockup from "@/components/brand-lockup";
import { leavePersona } from "@/lib/persona-sign-out-client";

const links = [
  ["/vendors/desk", "Jobs"],
  ["/vendors/settings", "Bid settings"],
  ["/vendors/crew", "Crew"],
  ["/vendors/receivables", "Receivables"],
  ["/vendors/payouts", "Bank account"],
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
        <div className="deskHead">
          <BrandLockup artwork="lockup" />
          <button className="textBtn" onClick={() => void leavePersona("/api/vendors/session", "/vendors/login")}>Sign out</button>
        </div>
        <nav className="vendorDeskNav">
          {links.map(([href, label]) => (
            <a key={href} href={href} className={pathname === href ? "active" : ""}>{label}</a>
          ))}
        </nav>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {lede && <p className="summary">{lede}</p>}
        {children}
      </section>
    </main>
  );
}
