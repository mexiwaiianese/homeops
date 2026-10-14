import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { discoverRecipientPlatform, saveRecipientPlatformProfile } from "@/lib/invoice-recipient-platform";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return runCron(request);
}

export async function POST(request: Request) {
  return runCron(request);
}

async function runCron(request: Request) {
  const secret = process.env.INVOICE_DISCOVERY_CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Set INVOICE_DISCOVERY_CRON_SECRET before scheduling recipient research." }, { status: 503 });
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const left = Buffer.from(token);
  const right = Buffer.from(secret);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Supabase service role is required." }, { status: 503 });

  const active = await admin
    .from("vendor_self_invoices")
    .select("vendor_id, bill_to_email")
    .in("status", ["sent", "viewed", "overdue"])
    .limit(2000);
  if (active.error) return NextResponse.json({ error: active.error.message }, { status: 500 });
  const activeKeys = new Set((active.data || []).map((row) => `${row.vendor_id}:${String(row.bill_to_email).toLowerCase()}`));
  const now = new Date().toISOString();
  const due = await admin
    .from("vendor_self_clients")
    .select("*")
    .or(`platform_next_search_at.is.null,platform_next_search_at.lte.${now}`)
    .order("platform_next_search_at", { ascending: true, nullsFirst: true })
    .limit(50);
  if (due.error) return NextResponse.json({ error: due.error.message }, { status: 500 });
  const eligible = (due.data || [])
    .filter((row) => activeKeys.has(`${row.vendor_id}:${String(row.email).toLowerCase()}`));
  const batch = eligible.slice(0, 3);

  const results = await Promise.all(batch.map(async (row) => {
    const discovery = await discoverRecipientPlatform(String(row.name), String(row.email));
    const profile = await saveRecipientPlatformProfile(admin, {
      vendorId: String(row.vendor_id),
      signupEmail: String(row.signup_email),
      name: String(row.name),
      email: String(row.email),
      status: discovery.status,
      answer: discovery.answer,
      existingOfferToken: String(row.offer_token),
    });
    return { clientId: row.id, status: profile.status, provider: profile.provider };
  }));
  return NextResponse.json({ checked: results.length, results, remainingCandidates: Math.max(0, eligible.length - results.length) });
}
