"use client";

import { useState } from "react";

export default function OpenAllAccessButton({
  className = "primary",
  label = "Open all-access account",
}: {
  className?: string;
  label?: string;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/admin/all-access", { method: "POST" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.redirect) {
      setBusy(false);
      setError(body.error || "Could not open the all-access account.");
      return;
    }
    window.location.assign(body.redirect);
  }

  return (
    <>
      <button className={className} type="button" onClick={open} disabled={busy}>
        {busy ? "Opening…" : label}
      </button>
      {error ? <small className="allAccessError">{error}</small> : null}
    </>
  );
}
