import { validEmail, normalizeEmail } from "@/lib/demo-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendVendorEmail } from "@/lib/vendor-outreach";

export function safeNextPath(next: string | null | undefined) {
  const value = String(next || "").trim();
  if (!value || value === "/") return "/login";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/login";
}

function missingUser(message: string) {
  return /not found|does not exist|unable to find/i.test(message);
}

export async function issueResendMagicLink(input: {
  email: string;
  origin: string;
  next?: string;
  createUser?: boolean;
}) {
  const email = normalizeEmail(input.email);
  if (!validEmail(email)) return { error: "Enter a valid email address.", status: 400 as const };
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "Sign-in is not configured on this server.", status: 503 as const };

  const next = safeNextPath(input.next);
  const redirectTo = `${input.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  let generated = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } });

  if (generated.error && missingUser(generated.error.message)) {
    if (!input.createUser) return { ok: true as const, sent: false as const };
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (created.error && !/already|registered|exists/i.test(created.error.message || "")) {
      return { error: created.error.message || "Could not create the login.", status: 400 as const };
    }
    generated = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } });
  }

  const hashed = generated.data?.properties?.hashed_token;
  const verifyType = generated.data?.properties?.verification_type || "magiclink";
  if (generated.error || !hashed) {
    return { error: generated.error?.message || "Could not create a sign-in link.", status: 400 as const };
  }

  const url = `${input.origin}/auth/callback?token_hash=${encodeURIComponent(hashed)}&type=${encodeURIComponent(verifyType)}&next=${encodeURIComponent(next)}`;
  const delivery = await sendVendorEmail({
    to: email,
    subject: "Your portonOS sign-in link",
    text: [
      "Open portonOS with this one-time sign-in link:",
      "",
      url,
      "",
      "The link works once. If you did not ask for it, ignore this email.",
    ].join("\n"),
  });
  if (!delivery.sent) {
    if (delivery.provider === "unconfigured" && process.env.NODE_ENV !== "production") {
      return { ok: true as const, sent: false as const, devLink: url };
    }
    return { error: delivery.error || "Could not send the sign-in email.", status: 400 as const };
  }
  return { ok: true as const, sent: true as const };
}

export async function createPasswordAccount(input: { email: string; password: string }) {
  const email = normalizeEmail(input.email);
  if (!validEmail(email)) return { error: "Enter a valid email address.", status: 400 as const };
  if (input.password.length < 8) return { error: "Use a password with at least 8 characters.", status: 400 as const };
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "Sign-in is not configured on this server.", status: 503 as const };
  const created = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  });
  if (created.error) {
    if (/already|registered|exists/i.test(created.error.message || "")) {
      return { error: "That email already has an account. Sign in with your password, Google, Apple, or a sign-in link.", status: 409 as const };
    }
    return { error: created.error.message, status: 400 as const };
  }
  return { ok: true as const };
}
