import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";

export async function POST(request: Request) {
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase || !user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const body = await request.json();
  const { data, error } = await supabase.from("homes").insert({
    organization_id: organizationId,
    owner_id: body.ownerId,
    address1: body.address1,
    city: body.city,
    state: body.state ?? "UT",
    postal_code: body.postalCode ?? null,
    monthly_rent_cents: Math.round(Number(body.monthlyRent ?? 0) * 100),
    reserve_balance_cents: Math.round(Number(body.reserveBalance ?? 0) * 100),
    health_status: body.healthStatus ?? "good",
    access_notes: body.accessNotes ?? [],
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ home: data }, { status: 201 });
}
