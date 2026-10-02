import { NextResponse } from "next/server";
import { createPasswordAccount, issueResendMagicLink, safeNextPath } from "@/lib/auth-magic-link";
import { clientKey, unlockAttemptAllowed } from "@/lib/persona-login/gate";

export async function POST(request: Request) {
  if (!unlockAttemptAllowed(`auth-magic:${clientKey(request)}`)) {
    return NextResponse.json({ error: "Too many attempts. Wait a few minutes, or sign in with a password, Google, or Apple." }, { status: 429 });
  }
  const body = await request.json().catch(() => ({}));
  const origin = new URL(request.url).origin;
  const result = await issueResendMagicLink({
    email: String(body.email || ""),
    origin,
    next: safeNextPath(body.next),
    createUser: Boolean(body.createUser),
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({
    ok: true,
    message: "Check your email for a one-time sign-in link. It stops working after you open it.",
    devLink: "devLink" in result ? result.devLink : undefined,
  });
}

export async function PUT(request: Request) {
  if (!unlockAttemptAllowed(`auth-password:${clientKey(request)}`)) {
    return NextResponse.json({ error: "Too many attempts. Wait a few minutes." }, { status: 429 });
  }
  const body = await request.json().catch(() => ({}));
  const result = await createPasswordAccount({
    email: String(body.email || ""),
    password: String(body.password || ""),
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
