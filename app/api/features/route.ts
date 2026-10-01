import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { getDemoSession } from "@/lib/demo-access";
import { ALL_FEATURES_ON } from "@/lib/product-features";
import { blankWorkspaceCookie, memoryWorkspaceById } from "@/lib/provision-org";
import { featuresForOrganization, listPackages } from "@/lib/subscription-packages";
import { cookies } from "next/headers";

export async function GET() {
  const { organizationId, demoSession, role } = await getAuthedContext();
  const packages = await listPackages();
  if (organizationId) {
    return NextResponse.json({
      mode: "live",
      role,
      features: await featuresForOrganization(organizationId),
      packages,
    });
  }
  const blankId = (await cookies()).get(blankWorkspaceCookie)?.value;
  const blank = blankId ? memoryWorkspaceById(blankId) : null;
  if (blank) {
    return NextResponse.json({
      mode: "live",
      role: "owner",
      features: await featuresForOrganization(blank.organizationId),
      packageId: blank.packageId,
      packages,
    });
  }
  const demo = demoSession || (await getDemoSession());
  return NextResponse.json({
    mode: demo ? "demo" : "public",
    role: demo?.role ?? null,
    features: ALL_FEATURES_ON,
    packages,
  });
}
