/** End a portal session, then follow the redirect the server chose (persona switcher or that portal's login). */
export async function leavePersona(endpoint: string, fallback: string) {
  let redirect = fallback;
  try {
    const response = await fetch(endpoint, { method: "DELETE" });
    const body = await response.json().catch(() => null);
    const next = body && typeof body.redirect === "string" ? body.redirect : "";
    if (next.startsWith("/") && !next.startsWith("//")) redirect = next;
  } catch {
    // The session request failed; still leave the portal.
  }
  window.location.assign(redirect);
}
