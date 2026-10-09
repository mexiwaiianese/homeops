"use client";

import { useEffect, useState } from "react";

export type TourScreen = {
  id: string;
  href: string;
  tab: string;
  title: string;
  body: string;
};

type Visit = { dismissed: boolean; index: number };

const visits = new Map<string, Visit>();
// React remounts once in development. This lets that remount keep the tour open
// after the session flag is written, without showing it again on the next page.
const strictRemount = new Set<string>();

function visitFor(prefix: string) {
  const current = visits.get(prefix);
  if (current) return current;
  const created = { dismissed: false, index: 0 };
  visits.set(prefix, created);
  return created;
}

function sessionKey(storageKey: string) {
  return `${storageKey}:session`;
}

export default function ProductTour({
  storagePrefix,
  persona,
  userKey,
  screens,
}: {
  storagePrefix: string;
  persona: string;
  userKey: string;
  screens: TourScreen[];
}) {
  const visit = visitFor(storagePrefix);
  const [index, setIndex] = useState(visit.index);
  const [open, setOpen] = useState(false);
  const [hideOnLaunch, setHideOnLaunch] = useState(false);
  const storageKey = `${storagePrefix}${userKey}`;

  useEffect(() => {
    if (!screens.length || !userKey) return;
    if (window.localStorage.getItem(storageKey) === "1" || visit.dismissed) return;
    const seenKey = sessionKey(storageKey);
    const page = window.location.pathname;
    const seen = window.sessionStorage.getItem(seenKey);
    if (seen) {
      if (!(strictRemount.has(seenKey) && seen === page)) return;
      strictRemount.delete(seenKey);
      setIndex(visit.index);
      setOpen(true);
      return;
    }
    window.sessionStorage.setItem(seenKey, page);
    strictRemount.add(seenKey);
    setHideOnLaunch(false);
    setIndex(visit.index);
    setOpen(true);
  }, [screens, storageKey, userKey, visit]);

  useEffect(() => {
    const screen = screens[index];
    document.querySelectorAll<HTMLElement>("[data-tour-tab]").forEach((node) => {
      const tab = node.dataset.tourTab || "";
      node.classList.toggle("tourTarget", Boolean(open && screen && tab.split(" ").includes(screen.href)));
    });
    return () => {
      document.querySelectorAll<HTMLElement>("[data-tour-tab]").forEach((node) => node.classList.remove("tourTarget"));
    };
  }, [open, index, screens]);

  if (!open || !screens.length) return null;
  const screen = screens[Math.min(index, screens.length - 1)];
  const last = index >= screens.length - 1;

  function move(next: number) {
    visit.index = next;
    setIndex(next);
  }

  function finish() {
    visit.dismissed = true;
    setOpen(false);
  }

  return (
    <div className="tourShade" role="presentation">
      <section className="tourCard" role="dialog" aria-modal="true" aria-labelledby={`${storagePrefix}title`}>
        <p className="eyebrow">{persona} tour</p>
        <p className="tourStep">Tab {index + 1} of {screens.length} · {screen.tab}</p>
        <h2 id={`${storagePrefix}title`}>{screen.title}</h2>
        <p>{screen.body}</p>
        <a className="textBtn tourOpenTab" href={screen.href}>Open {screen.tab}</a>
        <label className="checkRow tourOptOut">
          <input
            type="checkbox"
            checked={hideOnLaunch}
            onChange={(event) => {
              const checked = event.target.checked;
              setHideOnLaunch(checked);
              if (checked) window.localStorage.setItem(storageKey, "1");
              else window.localStorage.removeItem(storageKey);
            }}
          />
          <span>Do not show on launch</span>
        </label>
        <div className="tourActions">
          <button className="secondaryBtn" type="button" onClick={() => move(Math.max(0, index - 1))} disabled={index === 0}>Back</button>
          {last
            ? <button className="primary" type="button" onClick={finish}>Done</button>
            : <button className="primary" type="button" onClick={() => move(index + 1)}>Next</button>}
        </div>
      </section>
    </div>
  );
}
