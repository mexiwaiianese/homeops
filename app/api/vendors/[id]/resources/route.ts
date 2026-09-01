import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
const allowed: any = {
  contacts: "vendor_contacts",
  services: "vendor_services",
  areas: "vendor_service_areas",
  credentials: "vendor_credentials",
  ownerPreferences: "vendor_owner_preferences",
  propertyPreferences: "vendor_property_preferences",
};
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase || !user || !organizationId)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  const { id } = await params;
  const b = await request.json();
  const table = allowed[b.resource];
  if (!table)
    return NextResponse.json({ error: "Unknown resource" }, { status: 400 });
  const fields = { ...b };
  delete fields.resource;
  if (b.resource === "areas" && fields.coverageGeoJson) {
    try {
      const geometry = JSON.parse(fields.coverageGeoJson);
      if (!["Polygon", "MultiPolygon"].includes(geometry.type)) throw new Error("Coverage must be Polygon or MultiPolygon GeoJSON");
      fields.coverage = JSON.stringify(geometry.type === "Polygon" ? { type: "MultiPolygon", coordinates: [geometry.coordinates] } : geometry);
      delete fields.coverageGeoJson;
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid coverage GeoJSON" }, { status: 400 });
    }
  }
  const { data, error } = await supabase
    .from(table)
    .insert({ ...fields, vendor_id: id, organization_id: organizationId })
    .select()
    .single();
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ item: data }, { status: 201 });
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase || !user || !organizationId)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  const { id } = await params;
  const b = await request.json();
  const table = allowed[b.resource];
  if (!table || !b.itemId)
    return NextResponse.json({ error: "Invalid resource" }, { status: 400 });
  const fields = { ...b };
  delete fields.resource;
  delete fields.itemId;
  const { data, error } = await supabase
    .from(table)
    .update(fields)
    .eq("id", b.itemId)
    .eq("vendor_id", id)
    .eq("organization_id", organizationId)
    .select()
    .single();
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ item: data });
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase || !user || !organizationId)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  const { id } = await params;
  const b = await request.json();
  const table = allowed[b.resource];
  if (!table || !b.itemId)
    return NextResponse.json({ error: "Invalid resource" }, { status: 400 });
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("id", b.itemId)
    .eq("vendor_id", id)
    .eq("organization_id", organizationId);
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ ok: true });
}
