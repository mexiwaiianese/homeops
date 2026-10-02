import { NextResponse } from "next/server";
import { OPERATOR_ADMIN_EMAIL, requirePlatformAdmin } from "@/lib/operator-admin";
import { clientKey, unlockAttemptAllowed } from "@/lib/persona-login/gate";
import { sendVendorEmail } from "@/lib/vendor-outreach";
import { appBaseUrl } from "@/lib/vendor-prospects";

export async function POST(request: Request) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;
  if (!unlockAttemptAllowed(`email-test:${clientKey(request)}`)) {
    return NextResponse.json({ error: "Wait a few minutes before sending another test." }, { status: 429 });
  }
  const from = process.env.VENDOR_OUTREACH_FROM_EMAIL || "";
  const origin = new URL(request.url).origin;
  const stamp = new Date().toISOString();
  const delivery = await sendVendorEmail({
    to: OPERATOR_ADMIN_EMAIL,
    subject: `portonOS deliverability test ${stamp}`,
    text: [
      "This is a Resend deliverability test from portonOS.",
      "",
      `Sent at: ${stamp}`,
      `Request origin: ${origin}`,
      `NEXT_PUBLIC_APP_URL: ${appBaseUrl()}`,
      `From: ${from || "(VENDOR_OUTREACH_FROM_EMAIL is not set)"}`,
      "",
      "If this arrived, Vercel Resend is delivering to the platform admin inbox.",
      "No vendors were emailed.",
    ].join("\n"),
  });
  if (!delivery.sent) {
    return NextResponse.json({
      ok: false,
      to: OPERATOR_ADMIN_EMAIL,
      from: from || null,
      provider: delivery.provider,
      error: delivery.error || "Could not send the test email.",
    }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    to: OPERATOR_ADMIN_EMAIL,
    from,
    provider: delivery.provider,
  });
}
