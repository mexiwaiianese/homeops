import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/operator-admin";
import { FEATURE_KEYS, parseFeatureMap, parseOverrides } from "@/lib/product-features";
import { listPackages, savePackage } from "@/lib/subscription-packages";

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return admin.response;
  const packages = await listPackages();
  return NextResponse.json({ packages, featureKeys: FEATURE_KEYS });
}

export async function PUT(request: Request) {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return admin.response;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Package id is required." }, { status: 400 });
  const saved = await savePackage({
    id,
    name: String(body.name || id),
    description: String(body.description || ""),
    sortOrder: Number(body.sortOrder) || 0,
    monthlyCents: Number(body.monthlyCents) || 0,
    features: parseFeatureMap(body.features),
    isDefault: body.isDefault === true,
  });
  return NextResponse.json({ ok: true, package: saved, overrides: parseOverrides(body.overrides) });
}
