"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

/**
 * Sidebar sign-out for the manager desk. Ends the manager session (and the active persona) and
 * returns to /login. Works in demo mode too, where it simply takes the tester back to the sign-in
 * screen so they can pick another persona.
 */
export default function ManagerSignOut({ className = "nav" }: { className?: string }) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/session", { method: "DELETE" });
    } catch {
      // Cookies may already be gone; still return to the sign-in screen.
    }
    window.location.href = "/login";
  }

  return (
    <button type="button" className={`${className} signOutNav`} onClick={() => void signOut()} disabled={busy} title="Sign out">
      <LogOut className="navIcon navGlyph" aria-hidden="true" />
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
