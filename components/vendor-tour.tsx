"use client";

import { useEffect, useState } from "react";
import { tourForAccess, type VendorTourScreen } from "@/lib/vendor-tour";

const HIDE_PREFIX = "portonos-vendor-tour-hide:";

const visit = { dismissed: false, index: 0 };

function storageKey(userKey: string) {
  return `${HIDE_PREFIX}${userKey}`;
}

export default function VendorTour() {
  const [screens, setScreens] = useState<VendorTourScreen[]>([]);
  const [persona, setPersona] = useState("");
  const [userKey, setUserKey] = useState("");
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [hideOnLaunch, setHideOnLaunch] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/vendors/session")
      .then(async (response) => ({ ok: response.ok, body: await response.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (cancelled || !ok || !body.vendor?.id) return;
        const key = `${body.vendor.id}:${body.vendor.email || body.vendor.role || "vendor"}`;
        if (window.localStorage.getItem(storageKey(key)) === "1" || visit.dismissed) return;
        const tour = tourForAccess(body.vendor.role);
        if (!tour.screens.length) return;
        setUserKey(key);
        setPersona(tour.label);
        setScreens(tour.screens);
        setIndex(visit.index);
        setOpen(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const screen = screens[index];
    document.querySelectorAll<HTMLElement>("[data-tour-tab]").forEach((node) => {
      node.classList.toggle("tourTarget", Boolean(open && screen && node.dataset.tourTab === screen.href));
    });
    return () => {
      document.querySelectorAll<HTMLElement>("[data-tour-tab]").forEach((node) => node.classList.remove("tourTarget"));
    };
  }, [open, index, screens]);

  if (!open || !screens.length) return null;
  const screen = screens[index];
  const last = index === screens.length - 1;

  function finish() {
    visit.dismissed = true;
    setOpen(false);
  }

  return (
    <div className="tourShade" role="presentation">
      <section className="tourCard" role="dialog" aria-modal="true" aria-labelledby="vendor-tour-title">
        <p className="eyebrow">{persona} tour</p>
        <p className="tourStep">Tab {index + 1} of {screens.length} · {screen.tab}</p>
        <h2 id="vendor-tour-title">{screen.title}</h2>
        <p>{screen.body}</p>
        <a className="textBtn tourOpenTab" href={screen.href}>Open {screen.tab}</a>
        <label className="checkRow tourOptOut">
          <input
            type="checkbox"
            checked={hideOnLaunch}
            onChange={(event) => {
              const checked = event.target.checked;
              setHideOnLaunch(checked);
              if (!userKey) return;
              const key = storageKey(userKey);
              if (checked) window.localStorage.setItem(key, "1");
              else window.localStorage.removeItem(key);
            }}
          />
          <span>Do not show on launch</span>
        </label>
        <div className="tourActions">
          <button className="secondaryBtn" type="button" onClick={() => setIndex((current) => {
            const next = Math.max(0, current - 1);
            visit.index = next;
            return next;
          })} disabled={index === 0}>Back</button>
          {last
            ? <button className="primary" type="button" onClick={finish}>Done</button>
            : <button className="primary" type="button" onClick={() => setIndex((current) => {
              const next = current + 1;
              visit.index = next;
              return next;
            })}>Next</button>}
        </div>
      </section>
    </div>
  );
}
