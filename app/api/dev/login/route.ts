import { NextResponse } from "next/server";
import { consumeDevLoginToken, devToolsEnabled, issueDevLoginToken, operatorEmails } from "@/lib/dev-login";
import { clientKey, issueUnlockCookie, unlockAttemptAllowed } from "@/lib/persona-login/gate";
import { getPersonaLoginConfig } from "@/lib/persona-login/config";
import { sendVendorEmail } from "@/lib/vendor-outreach";

export async function POST(request: Request) {
  if (!devToolsEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!unlockAttemptAllowed(`dev-login:${clientKey(request)}`)) {
    return NextResponse.json({ error: "Too many attempts. Wait a few minutes." }, { status: 429 });
  }
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const allowed = operatorEmails();
  if (allowed.length && !allowed.includes(email)) {
    // Same reply as a real send, so the form does not reveal which addresses are on the list.
    return NextResponse.json({ ok: true });
  }
  const token = issueDevLoginToken(email);
  const url = `${new URL(request.url).origin}/api/dev/login?token=${encodeURIComponent(token)}`;
  const delivery = await sendVendorEmail({
    to: email,
    subject: "Your HomeOps operator login link",
    text: [
      "Open the HomeOps operator tools with this link:",
      "",
      url,
      "",
      "The link works once and expires in 20 minutes.",
      "If you did not ask for it, ignore this email.",
    ].join("\n"),
  });
  if (!delivery.sent) {
    // Local machines often have no mail provider. Show the link there so the door still opens.
    if (delivery.provider === "unconfigured") return NextResponse.json({ ok: true, devLink: url });
    return NextResponse.json({ error: delivery.error || "Could not send the email." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  if (!devToolsEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const token = new URL(request.url).searchParams.get("token") || "";
  const email = token ? consumeDevLoginToken(token) : null;
  const home = new URL("/admin/login", request.url);
  if (!email) {
    home.searchParams.set("error", "That login link has expired. Request a new one.");
    return NextResponse.redirect(home);
  }
  const response = NextResponse.redirect(home);
  const cookie = issueUnlockCookie(getPersonaLoginConfig());
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
