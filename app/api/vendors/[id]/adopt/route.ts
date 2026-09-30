import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { adoptCatalogVendor, getPlatformCatalog } from "@/lib/platform-catalog";
import { isNetworkAdmin } from "@/lib/vendors";
import { vendors as demoVendors } from "@/lib/vendor-demo";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, organizationId, role } = await getAuthedContext();
  const { id } = await params;

  if (!supabase) {
    const demo = demoVendors.find((row) => row.id === id && row.catalog_released);
    if (!demo) return NextResponse.json({ error: "Catalog vendor not found" }, { status: 404 });
    return NextResponse.json({ mode: "demo", vendorId: demo.id, alreadyAdopted: false });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!isNetworkAdmin(role)) return NextResponse.json({ error: "Owner or org admin required" }, { status: 403 });

  const catalog = await getPlatformCatalog();
  if (!catalog.ok) return NextResponse.json({ error: catalog.error }, { status: 400 });
  const result = await adoptCatalogVendor({
    admin: catalog.admin,
    catalogOrgId: catalog.organizationId,
    organizationId,
    catalogVendorId: id,
    userId: user.id,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ mode: "live", vendorId: result.vendorId, alreadyAdopted: result.alreadyAdopted });
}
