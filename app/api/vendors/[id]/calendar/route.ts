import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { isNetworkAdmin } from "@/lib/vendors";
import { getDemoCalendar, setDemoCalendar } from "@/lib/vendor-auction-demo";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, organizationId } = await getAuthedContext();
  const { id } = await params;
  if (!supabase) return NextResponse.json({ mode: "demo", connection: getDemoCalendar(id) });
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { data } = await supabase.from("vendor_calendar_connections").select("*").eq("vendor_id", id).eq("organization_id", organizationId).maybeSingle();
  return NextResponse.json({ mode: "live", connection: data || { status: "disconnected", provider: "demo" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, organizationId, role } = await getAuthedContext();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action === "disconnect" ? "disconnect" : "connect";
  const connection = action === "connect"
    ? { provider: "demo", status: "connected" as const, connected_at: new Date().toISOString(), metadata: { busyBlocks: [] } }
    : { provider: "demo", status: "disconnected" as const, connected_at: null, metadata: { busyBlocks: [] } };

  if (!supabase) return NextResponse.json({ mode: "demo", connection: setDemoCalendar(id, connection) });
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!isNetworkAdmin(role)) return NextResponse.json({ error: "Network admin required" }, { status: 403 });
  if (body.provider === "google" && !process.env.GOOGLE_CALENDAR_CLIENT_ID) {
    return NextResponse.json({ error: "Google Calendar OAuth is not configured. Connect a demo calendar for now." }, { status: 400 });
  }
  const { data, error } = await supabase.from("vendor_calendar_connections").upsert({
    organization_id: organizationId,
    vendor_id: id,
    provider: connection.provider,
    status: connection.status,
    connected_at: connection.connected_at,
    metadata: connection.metadata,
    updated_at: new Date().toISOString(),
  }, { onConflict: "vendor_id" }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ mode: "live", connection: data });
}
