import { NextResponse } from "next/server";
import {
  clearOperatorCookie,
  consumeOperatorLoginToken,
  issueOperatorCookie,
  issueOperatorLoginToken,
  isOperatorEmail,
} from "@/lib/operator-admin";
import { clientKey, unlockAttemptAllowed } from "@/lib/persona-login/gate";
import { sendVendorEmail } from "@/lib/vendor-outreach";

export async function POST(request: Request) {
  if (!unlockAttemptAllowed(`admin-login:${clientKey(request)}`)) {
    return NextResponse.json({ error: "Too many attempts. Wait a few minutes." }, { status: 429 });
  }
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!isOperatorEmail(email)) {
    return NextResponse.json({ ok: true });
  }
  const token = issueOperatorLoginToken();
  const url = `${new URL(request.url).origin}/api/admin/login?token=${encodeURIComponent(token)}`;
  const delivery = await sendVendorEmail({
    to: email,
    subject: "Your portonOS platform admin link",
    text: [
      "Open vendor recruitment and other platform-admin tools with this link:",
      "",
      url,
      "",
      "The link works once and expires in 20 minutes.",
      "If you did not ask for it, ignore this email.",
    ].join("\n"),
  });
  if (!delivery.sent) {
    if (delivery.provider === "unconfigured" && process.env.NODE_ENV !== "production") {
      return NextResponse.json({ ok: true, devLink: url });
    }
    return NextResponse.json({ error: delivery.error || "Could not send the email." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const email = token ? consumeOperatorLoginToken(token) : null;
  const dest = new URL("/admin/login", request.url);
  if (!email) {
    dest.pathname = "/admin/login";
    dest.searchParams.set("error", "That login link has expired. Request a new one.");
    return NextResponse.redirect(dest);
  }
  const response = NextResponse.redirect(dest);
  const cookie = issueOperatorCookie();
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  const cookie = clearOperatorCookie();
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
