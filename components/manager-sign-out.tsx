"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { leavePersona } from "@/lib/persona-sign-out-client";

/**
 * Sidebar sign-out for the manager desk. Ends the manager session. A browser that unlocked with
 * the beta access code returns to /dev/personas; everyone else returns to /login.
 */
export default function ManagerSignOut({ className = "nav" }: { className?: string }) {
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    await leavePersona("/api/session", "/login");
  }

  return (
    <button type="button" className={`${className} signOutNav`} onClick={() => void signOut()} disabled={busy} title="Sign out">
      <LogOut className="navIcon navGlyph" aria-hidden="true" />
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
