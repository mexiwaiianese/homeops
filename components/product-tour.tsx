"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export type TourScreen = {
  id: string;
  href: string;
  tab: string;
  title: string;
  body: string;
};

type SessionState = { status: "open" | "done"; index: number };

function readSession(key: string): SessionState | null {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(key) || "null");
    if (parsed && (parsed.status === "open" || parsed.status === "done")) {
      return { status: parsed.status, index: Number(parsed.index) || 0 };
    }
  } catch {}
  return null;
}

function writeSession(key: string, state: SessionState) {
  window.sessionStorage.setItem(key, JSON.stringify(state));
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
  const pathname = usePathname();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [hideOnLaunch, setHideOnLaunch] = useState(false);
  const storageKey = `${storagePrefix}${userKey}`;
  // Shown once per browser session. Moving between tabs during the tour resumes the same step.
  const sessionKey = `${storageKey}:session`;

  useEffect(() => {
    if (!screens.length || !userKey) return;
    if (window.localStorage.getItem(storageKey) === "1") return;
    const state = readSession(sessionKey);
    if (state?.status === "done") return;
    const start = Math.min(state?.index ?? 0, screens.length - 1);
    if (!state) writeSession(sessionKey, { status: "open", index: start });
    setHideOnLaunch(false);
    setIndex(start);
    setOpen(true);
  }, [screens, storageKey, sessionKey, userKey]);

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

  useEffect(() => {
    if (!open) return;
    const screen = screens[index];
    if (!screen?.href) return;
    const hashAt = screen.href.indexOf("#");
    const path = hashAt >= 0 ? screen.href.slice(0, hashAt) : screen.href;
    if (path.startsWith("/") && path !== pathname) {
      router.push(screen.href);
      return;
    }
    if (hashAt < 0) return;
    document.querySelectorAll<HTMLElement>("[data-tour-tab]").forEach((node) => {
      if (node.dataset.tourTab !== screen.href) return;
      if (node instanceof HTMLButtonElement && !node.classList.contains("active")) node.click();
    });
  }, [open, index, pathname, router, screens]);

  if (!open || !screens.length) return null;
  const screen = screens[Math.min(index, screens.length - 1)];
  const last = index >= screens.length - 1;

  function move(next: number) {
    writeSession(sessionKey, { status: "open", index: next });
    setIndex(next);
  }

  function finish() {
    writeSession(sessionKey, { status: "done", index });
    setOpen(false);
  }

  return (
    <div className="tourShade" role="presentation">
      <section className="tourCard" role="dialog" aria-modal="true" aria-labelledby={`${storagePrefix}title`}>
        <p className="eyebrow">{persona} tour</p>
        <p className="tourStep">Tab {index + 1} of {screens.length} · {screen.tab}</p>
        <h2 id={`${storagePrefix}title`}>{screen.title}</h2>
        <p>{screen.body}</p>
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
