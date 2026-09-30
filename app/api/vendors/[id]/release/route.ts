import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/operator-admin";
import { getPlatformCatalog, releaseCatalogVendor } from "@/lib/platform-catalog";
import { vendors as demoVendors } from "@/lib/vendor-demo";
import { canReleaseToOrganizations } from "@/lib/vendors";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return admin.response;
  const { id } = await params;
  const catalog = await getPlatformCatalog();
  if (!catalog.ok) {
    const demo = demoVendors.find((row) => row.id === id);
    if (!demo) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    if (!canReleaseToOrganizations(demo.workflow_stage)) {
      return NextResponse.json({ error: "Qualify the vendor through documents reviewed before releasing to organizations." }, { status: 400 });
    }
    return NextResponse.json({ mode: "demo", vendor: { ...demo, catalog_released: true } });
  }
  const result = await releaseCatalogVendor(catalog.admin, catalog.organizationId, id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error.includes("not found") ? 404 : 400 });
  return NextResponse.json({ mode: "live", vendor: result.vendor });
}
