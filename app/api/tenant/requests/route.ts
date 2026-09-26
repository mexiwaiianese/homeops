import { NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant-auth";
import { createTenantRequest, listTenantRequests, validateTenantRequest } from "@/lib/tenant-requests";

// Report an issue. The row is a normal maintenance_request, so it appears in the manager's
// operations inbox immediately and can be auctioned or auto-assigned to approved vendors.

export async function GET() {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json({ requests: await listTenantRequests(context) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load requests." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const context = await getTenantContext();
  if (!context) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const parsed = validateTenantRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const result = await createTenantRequest(context, parsed.input);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, request: result.request }, { status: 201 });
}
