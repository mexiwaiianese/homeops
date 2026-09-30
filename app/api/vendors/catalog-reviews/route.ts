import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/operator-admin";
import { listCatalogIntakeReviews } from "@/lib/catalog-intake";

export async function GET() {
  const admin = await requirePlatformAdmin();
  if (!admin.ok) return admin.response;
  const reviews = await listCatalogIntakeReviews();
  return NextResponse.json({
    reviews,
    pending: reviews.filter((row) => row.status === "pending").length,
  });
}
