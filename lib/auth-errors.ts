export function authErrorMessage(raw: string | null | undefined) {
  const text = decodeURIComponent(String(raw || "").replace(/\+/g, " ")).trim();
  const lower = text.toLowerCase();
  if (!text) return "";
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Too many sign-in emails from this address. Wait a few minutes, or sign in with a password, Google, or Apple.";
  }
  if (lower.includes("otp_expired") || lower.includes("access_denied") || lower.includes("invalid") || lower.includes("expired")) {
    return "That sign-in link was already used or has expired. Request a new one.";
  }
  return text;
}
