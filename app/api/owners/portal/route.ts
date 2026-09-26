import { NextResponse } from "next/server";
import { ownerAiConfigured } from "@/lib/owner-ai";
import { ownerPortalAccess } from "@/lib/owner-portal-access";
import { buildDemoOwnerPortal } from "@/lib/owner-portal-demo";
import { buildLiveOwnerPortal } from "@/lib/owner-portal-live";

export async function GET(request: Request) {
  const access = await ownerPortalAccess(request);
  if (access.mode === "error") return NextResponse.json({ error: access.error }, { status: access.status });
  const options = { aiConfigured: ownerAiConfigured(), preview: access.preview };
  if (access.mode === "demo") {
    const payload = buildDemoOwnerPortal(access.ownerId, options);
    if (!payload) return NextResponse.json({ error: "Owner not found" }, { status: 404 });
    return NextResponse.json(payload);
  }
  try {
    const payload = await buildLiveOwnerPortal(access.db, access.organizationId, access.ownerId, options);
    if ("error" in payload) return NextResponse.json({ error: payload.error }, { status: payload.status });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load the owner portal" }, { status: 500 });
  }
}
