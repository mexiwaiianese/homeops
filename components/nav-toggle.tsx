"use client";

import { useEffect, useRef, useState } from "react";

/** Collapses the nearest site menu on small screens. Desktop layout ignores the button. */
export default function NavToggle() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const root = ref.current?.closest("aside, [data-menu]");
    if (!root) return;

    const close = () => {
      root.classList.remove("menu-open");
      setOpen(false);
    };
    const onClick = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target || target.closest(".navToggle")) return;
      if (target.closest("a, button")) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onResize = () => {
      if (window.innerWidth > 700) close();
    };

    root.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      root.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      className="navToggle"
      aria-expanded={open}
      aria-label={open ? "Close menu" : "Open menu"}
      onClick={(event) => {
        const root = event.currentTarget.closest("aside, [data-menu]");
        const next = !open;
        root?.classList.toggle("menu-open", next);
        setOpen(next);
      }}
    >
      <span className="navToggleBars" aria-hidden="true" />
    </button>
  );
}
