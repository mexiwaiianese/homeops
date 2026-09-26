import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/rent";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { requestTenantLoginLink } from "@/lib/tenant-auth";

// Public. A tenant types an email or mobile number and we text or email a one-time link.
// The response never reveals whether the contact matched a tenant. In demo mode, where no
// email/SMS provider is wired, the link is returned so the flow can be walked locally.

const recent = new Map<string, number[]>();

function rateLimited(key: string) {
  const now = Date.now();
  const hits = (recent.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
  hits.push(now);
  recent.set(key, hits);
  return hits.length > 5;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const contact = String(body.contact || "").trim();
  if (contact.length < 5) return NextResponse.json({ error: "Enter the email or mobile number on your lease." }, { status: 400 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (rateLimited(`${ip}:${contact.toLowerCase()}`)) {
    return NextResponse.json({ error: "Too many requests. Wait a few minutes and try again." }, { status: 429 });
  }
  const channelRequested = body.channel === "sms" || body.channel === "email" ? body.channel : "auto";
  const result = await requestTenantLoginLink({ contact, preferredChannel: channelRequested, origin: appOrigin(request) });
  const demo = !isSupabaseConfigured();
  const channelWord = result.channel === "sms" ? "text" : "email";
  return NextResponse.json({
    ok: true,
    mode: demo ? "demo" : "live",
    message: result.found && result.delivered
      ? `Check your ${channelWord} for a sign-in link. It expires in 15 minutes.`
      : "If that contact is on a lease with us, a sign-in link is on its way. It expires in 15 minutes.",
    // Only the demo server hands back the link. Live servers rely on delivery or the manager desk.
    demoUrl: demo && result.found ? result.url : null,
    demoDelivery: demo ? { channel: result.channel, delivered: result.delivered, error: result.deliveryError } : undefined,
  });
}
