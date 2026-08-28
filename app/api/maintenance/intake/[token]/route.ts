import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Supabase service role is not configured" }, { status: 503 });
  const { token } = await params;
  const body = await request.json();
  const { data: link, error: linkError } = await admin.from("maintenance_intake_links").select("*").eq("token", token).eq("active", true).maybeSingle();
  if (linkError || !link) return NextResponse.json({ error: "This maintenance link is invalid or expired." }, { status: 404 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) return NextResponse.json({ error: "This maintenance link has expired." }, { status: 410 });

  const priority = body.emergency === true ? "emergency" : "normal";
  const { data: row, error } = await admin.from("maintenance_requests").insert({
    organization_id: link.organization_id,
    home_id: link.home_id,
    tenant_id: link.tenant_id,
    title: String(body.title || "Maintenance request").slice(0, 140),
    description: String(body.description || "").slice(0, 5000),
    priority,
    status: "diagnose",
    diagnosis: { source: "tenant_public_intake", symptoms: body.symptoms ?? [], availability: body.availability ?? null },
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from("activity_events").insert({ organization_id: link.organization_id, home_id: link.home_id, subject_type: "maintenance_request", subject_id: row.id, event_type: "tenant_intake_submitted", body: body.description ?? null });
  return NextResponse.json({ ok: true, requestId: row.id }, { status: 201 });
}
