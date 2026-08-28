import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase || !user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { id } = await params;
  const body = await request.json();
  const fields = {
    maintenance_authority_cents: Math.round(Number(body.maintenanceAuthority ?? 0) * 100),
    emergency_authority_cents: Math.round(Number(body.emergencyAuthority ?? 0) * 100),
    minimum_reserve_cents: Math.round(Number(body.minimumReserve ?? 0) * 100),
    notify_over_cents: Math.round(Number(body.notifyOver ?? 0) * 100),
    preferred_vendor_name: String(body.preferredVendor ?? ""),
    disbursement_day: Number(body.disbursementDay ?? 10),
    communication_preferences: body.communicationPreferences ?? {},
  };
  const { data, error } = await supabase.from("owners").update(fields).eq("id", id).eq("organization_id", organizationId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ owner: data });
}
