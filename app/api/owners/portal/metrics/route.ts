import { NextResponse } from "next/server";
import { validateMetricDefinition } from "@/lib/owner-portal";
import { ownerPortalAccess } from "@/lib/owner-portal-access";
import { addDemoCustomMetric, removeDemoCustomMetric } from "@/lib/owner-portal-demo";
import { addLiveCustomMetric, removeLiveCustomMetric } from "@/lib/owner-portal-live";

// Pin an AI (or hand-written) metric so it persists on the dashboard.
export async function POST(request: Request) {
  const access = await ownerPortalAccess(request);
  if (access.mode === "error") return NextResponse.json({ error: access.error }, { status: access.status });
  const body = await request.json().catch(() => ({}));
  const validated = validateMetricDefinition(body.definition);
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
  const prompt = String(body.prompt || validated.definition.title).slice(0, 1000);
  if (access.mode === "demo") return NextResponse.json({ mode: "demo", metric: addDemoCustomMetric(access.ownerId, prompt, validated.definition) });
  try {
    return NextResponse.json({ mode: "live", metric: await addLiveCustomMetric(access.db, access.organizationId, access.ownerId, access.userId, prompt, validated.definition) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save metric" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const access = await ownerPortalAccess(request);
  if (access.mode === "error") return NextResponse.json({ error: access.error }, { status: access.status });
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Metric id required" }, { status: 400 });
  if (access.mode === "demo") return NextResponse.json({ removed: removeDemoCustomMetric(access.ownerId, id) });
  try {
    return NextResponse.json({ removed: await removeLiveCustomMetric(access.db, access.ownerId, id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not remove metric" }, { status: 500 });
  }
}
