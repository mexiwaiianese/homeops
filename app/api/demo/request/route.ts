import { NextResponse } from "next/server";
import { demoLandingPath, isDemoRole, issueDemoAccessToken, validEmail } from "@/lib/demo-access";
import { clientKey, unlockAttemptAllowed } from "@/lib/persona-login/gate";
import { sendVendorEmail } from "@/lib/vendor-outreach";

export async function POST(request: Request) {
  if (!unlockAttemptAllowed(`demo-request:${clientKey(request)}`)) {
    return NextResponse.json({ error: "Too many attempts. Wait a few minutes." }, { status: 429 });
  }
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim();
  const role = body.role;
  if (!validEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!isDemoRole(role)) return NextResponse.json({ error: "Choose property manager, owner, or vendor." }, { status: 400 });

  const issued = await issueDemoAccessToken({ email, role });
  const url = `${new URL(request.url).origin}/api/demo/enter?token=${encodeURIComponent(issued.token)}`;
  const roleLabel = role === "manager" ? "property manager" : role === "owner" ? "property owner" : "vendor";
  const delivery = await sendVendorEmail({
    to: email,
    subject: `Your portonOS ${roleLabel} demo`,
    text: [
      `Open the portonOS ${roleLabel} demo with this private link:`,
      "",
      url,
      "",
      "The link is unique to you and expires in 7 days.",
      "If you did not ask for a demo, ignore this email.",
    ].join("\n"),
  });
  if (!delivery.sent) {
    if (delivery.provider === "unconfigured" && process.env.NODE_ENV !== "production") {
      return NextResponse.json({ ok: true, role, landingPath: demoLandingPath(role), devLink: url });
    }
    return NextResponse.json({ error: delivery.error || "Could not send the demo email." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, role });
}
