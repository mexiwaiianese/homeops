"use client";

import { useEffect, useState } from "react";
import ProductTour, { type TourScreen } from "@/components/product-tour";
import { tourForAccess } from "@/lib/vendor-tour";

let shown: { screens: TourScreen[]; persona: string; userKey: string } | null = null;

export default function VendorTour() {
  const [screens, setScreens] = useState<TourScreen[]>(shown?.screens ?? []);
  const [persona, setPersona] = useState(shown?.persona ?? "");
  const [userKey, setUserKey] = useState(shown?.userKey ?? "");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/vendors/session")
      .then(async (response) => ({ ok: response.ok, body: await response.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (cancelled || !ok || !body.vendor?.id) return;
        const tour = tourForAccess(body.vendor.role);
        const next = {
          userKey: `${body.vendor.id}:${body.vendor.email || body.vendor.role || "vendor"}`,
          persona: tour.label,
          screens: tour.screens,
        };
        shown = next;
        setUserKey(next.userKey);
        setPersona(next.persona);
        setScreens(next.screens);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!screens.length || !userKey) return null;
  return <ProductTour storagePrefix="portonos-vendor-tour-hide:" persona={persona} userKey={userKey} screens={screens} />;
}
