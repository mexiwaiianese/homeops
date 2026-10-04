// Where a portal "Sign out" sends the browser.
//
// A tester who unlocked with the beta access code goes back to /admin/personas, which is the persona
// list and the sign-in screen for the next persona. The unlock cookie stays, so they do not re-enter
// the code. Anyone else (a real login, or demo mode with no access code) goes to that portal's own
// login page.

import { resolvePersonaLoginAccess } from "@/lib/persona-login";

export const personaSwitcherPath = "/admin/personas";

export function signOutDestination(via: "open" | "code" | "allowlist" | null | undefined, fallback: string) {
  if (process.env.NODE_ENV === "production") return fallback;
  return via === "code" ? personaSwitcherPath : fallback;
}

export async function personaSignOutPath(fallback: string) {
  const access = await resolvePersonaLoginAccess();
  return signOutDestination(access.allowed ? access.via : null, fallback);
}
