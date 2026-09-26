import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { tenants as demoTenants } from "@/lib/data";
import { appOrigin } from "@/lib/rent";
import { requestTenantLoginLink } from "@/lib/tenant-auth";

// Manager-side: text or email a tenant their portal link from the operations desk.
// Because the caller is an authenticated manager, the URL is returned for copy/paste
// when no email/SMS provider is configured.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const channel = body.channel === "sms" || body.channel === "email" ? body.channel : "auto";
  const { supabase, user, organizationId } = await getAuthedContext();

  if (!supabase) {
    if (!demoTenants.some((row) => row.id === id)) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    const result = await requestTenantLoginLink({ tenantId: id, preferredChannel: channel, origin: appOrigin(request) });
    return NextResponse.json({ mode: "demo", ...result });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { data: tenant } = await supabase.from("tenants").select("id").eq("id", id).eq("organization_id", organizationId).maybeSingle();
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  const result = await requestTenantLoginLink({ tenantId: id, preferredChannel: channel, origin: appOrigin(request), requestedBy: user.id });
  return NextResponse.json({ mode: "live", ...result });
}
