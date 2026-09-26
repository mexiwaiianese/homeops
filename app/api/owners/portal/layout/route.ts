import { NextResponse } from "next/server";
import { parseLayout } from "@/lib/owner-portal";
import { ownerPortalAccess } from "@/lib/owner-portal-access";
import { saveDemoLayout } from "@/lib/owner-portal-demo";
import { saveLiveLayout } from "@/lib/owner-portal-live";

export async function PUT(request: Request) {
  const access = await ownerPortalAccess(request);
  if (access.mode === "error") return NextResponse.json({ error: access.error }, { status: access.status });
  const body = await request.json().catch(() => ({}));
  const layout = parseLayout(body.layout);
  if (!layout) return NextResponse.json({ error: "Layout must include order and hidden arrays." }, { status: 400 });
  if (access.mode === "demo") return NextResponse.json({ mode: "demo", layout: saveDemoLayout(access.ownerId, layout) });
  try {
    return NextResponse.json({ mode: "live", layout: await saveLiveLayout(access.db, access.organizationId, access.ownerId, access.userId, layout) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save layout" }, { status: 500 });
  }
}
