import { NextResponse } from "next/server";
import { signInWithPasswordAccount } from "@/lib/auth-magic-link";
import { applyNoStore } from "@/lib/http-security";
import { clientKey, unlockAttemptAllowed } from "@/lib/persona-login/gate";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!unlockAttemptAllowed(`auth-password-sign-in:${clientKey(request)}`)) {
    return applyNoStore(NextResponse.json({ error: "Too many attempts. Wait a few minutes." }, { status: 429 }));
  }
  const body = await request.json().catch(() => ({}));
  const result = await signInWithPasswordAccount({
    email: String(body.email || ""),
    password: String(body.password || ""),
  });
  if ("error" in result) return applyNoStore(NextResponse.json({ error: result.error }, { status: result.status }));
  return applyNoStore(NextResponse.json({ ok: true }));
}
