import { NextResponse } from "next/server";
import { askOwnerAi } from "@/lib/owner-ai";
import { buildSnapshot, filterHomes, filtersToRange, type DashboardFilters } from "@/lib/owner-portal";
import { ownerPortalAccess } from "@/lib/owner-portal-access";
import { buildDemoOwnerPortal } from "@/lib/owner-portal-demo";
import { buildLiveOwnerPortal } from "@/lib/owner-portal-live";

// Turns an owner's plain-language request into a metric definition. The client evaluates it
// against the same data it already has, so one-time answers and pinned metrics always agree.
export async function POST(request: Request) {
  const access = await ownerPortalAccess(request);
  if (access.mode === "error") return NextResponse.json({ error: access.error }, { status: access.status });
  const body = await request.json().catch(() => ({}));
  const prompt = String(body.prompt || "").trim();
  if (!prompt) return NextResponse.json({ error: "Ask a question first." }, { status: 400 });

  const filters: DashboardFilters = {
    homeIds: Array.isArray(body.filters?.homeIds) ? body.filters.homeIds.map(String) : [],
    types: Array.isArray(body.filters?.types) ? body.filters.types : [],
    preset: body.filters?.preset || "ytd",
    customStart: String(body.filters?.customStart || ""),
    customEnd: String(body.filters?.customEnd || ""),
  };

  const payload = access.mode === "demo"
    ? buildDemoOwnerPortal(access.ownerId, { aiConfigured: true, preview: access.preview })
    : await buildLiveOwnerPortal(access.db, access.organizationId, access.ownerId, { aiConfigured: true, preview: access.preview }).catch((error: Error) => ({ error: error.message, status: 500 }));
  if (!payload) return NextResponse.json({ error: "Owner not found" }, { status: 404 });
  if ("error" in payload) return NextResponse.json({ error: payload.error }, { status: payload.status });

  const range = filtersToRange(filters);
  const homes = filterHomes(payload.homes, filters);
  const snapshot = buildSnapshot({ owner: payload.owner, homes, entries: payload.entries, maintenance: payload.maintenance, range, totalHomes: payload.homes.length });
  const result = await askOwnerAi({ prompt, homes: payload.homes, variables: snapshot.variables, periodLabel: range.label });
  if (!result.ok) return NextResponse.json({ error: result.error, source: result.source }, { status: 422 });
  return NextResponse.json({ definition: result.definition, source: result.source, note: result.note || null });
}
