"use client";

import { useEffect, useState } from "react";
import BrandIcon from "@/components/brand-icon";
import BrandLockup from "@/components/brand-lockup";
import ManagerSignOut from "@/components/manager-sign-out";
import NavToggle from "@/components/nav-toggle";
import DeskTour from "@/components/desk-tour";
import { ALL_FEATURES_ON, featureEnabled, opsHomePath, type FeatureMap } from "@/lib/product-features";

type NavKey = "operations" | "listings" | "applications" | "payments" | "books" | "vendors";

const LINKS: Array<{ key: NavKey; href?: string; label: string; icon: "listing" | "applications" | "rent"; feature: "operations" | "listings" | "applications" | "payments" | "books" | "approved_vendors" }> = [
  { key: "operations", label: "Operations", icon: "listing", feature: "operations" },
  { key: "listings", href: "/listings", label: "Listings", icon: "listing", feature: "listings" },
  { key: "applications", href: "/applications", label: "Applications", icon: "applications", feature: "applications" },
  { key: "payments", href: "/payments", label: "Payments", icon: "rent", feature: "payments" },
  { key: "books", href: "/financials", label: "Books", icon: "rent", feature: "books" },
  { key: "vendors", href: "/vendors", label: "Approved Vendors", icon: "applications", feature: "approved_vendors" },
];

export default function ManagerOpsNav({ active }: { active: NavKey }) {
  const [mode, setMode] = useState("live");
  const [features, setFeatures] = useState<FeatureMap>(ALL_FEATURES_ON);

  useEffect(() => {
    fetch("/api/features")
      .then((r) => r.json())
      .then((body) => {
        if (body.mode) setMode(body.mode);
        if (body.features) setFeatures({ ...ALL_FEATURES_ON, ...body.features });
      })
      .catch(() => undefined);
  }, []);

  const ops = opsHomePath(mode === "demo" ? "demo" : "live");

  return (
    <>
      <BrandLockup href={ops} className="finBrand" />
      <NavToggle />
      <nav>
        {LINKS.map((link) => {
          if (!featureEnabled(features, link.feature)) return null;
          const href = link.key === "operations" ? ops : link.href!;
          return (
            <a key={link.key} className={active === link.key ? "finNav active" : "finNav"} href={href} data-tour-tab={href}>
              <BrandIcon name={link.icon} className="navIcon" />
              {link.label}
            </a>
          );
        })}
        <ManagerSignOut className="finNav" />
      </nav>
      <DeskTour persona="manager" />
    </>
  );
}
