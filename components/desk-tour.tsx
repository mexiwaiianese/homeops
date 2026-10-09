"use client";

import { useEffect, useState } from "react";
import ProductTour, { type TourScreen } from "@/components/product-tour";
import { tourForDesk } from "@/lib/desk-tour";
import type { FeatureMap } from "@/lib/product-features";

export default function DeskTour({ persona }: { persona: "manager" | "owner" }) {
  const [screens, setScreens] = useState<TourScreen[]>([]);
  const [label, setLabel] = useState("");
  const [userKey, setUserKey] = useState("");

  useEffect(() => {
    let cancelled = false;
    const sessionUrl = persona === "owner" ? "/api/owners/session" : "/api/session";
    Promise.all([
      fetch(sessionUrl).then(async (response) => ({ ok: response.ok, body: await response.json().catch(() => ({})) })),
      persona === "manager"
        ? fetch("/api/features").then(async (response) => response.ok ? response.json() : null).catch(() => null)
        : Promise.resolve(null),
    ]).then(([session, features]) => {
      if (cancelled || !session.ok) return;
      const body = session.body as { signedIn?: boolean; email?: string | null; role?: string | null; ownerId?: string; preview?: boolean };
      if (persona === "owner" && (!body.ownerId || body.preview)) return;
      if (persona === "manager" && body.signedIn === false) return;
      const role = persona === "owner" ? "property_owner" : (features?.role || body.role);
      const home = features?.mode === "demo" ? "/demo" : "/app";
      const tour = tourForDesk({
        role,
        persona,
        features: (features?.features || null) as FeatureMap | null,
        home,
      });
      const id = persona === "owner" ? body.ownerId : (body.email || role || "manager");
      if (!id || !tour.screens.length) return;
      setUserKey(String(id));
      setLabel(tour.label);
      setScreens(tour.screens);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [persona]);

  if (!screens.length || !userKey) return null;
  return (
    <ProductTour
      storagePrefix={persona === "owner" ? "portonos-owner-tour-hide:" : "portonos-manager-tour-hide:"}
      persona={label}
      userKey={userKey}
      screens={screens}
    />
  );
}
