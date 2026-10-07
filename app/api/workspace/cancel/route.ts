import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { applyClearedDemoCookies, demoSessionCookie, revokeDemoSessionCookie } from "@/lib/demo-access";
import { cancelWorkspace } from "@/lib/workspace-cancel";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await getAuthedContext();
  if (!auth.organizationId && !auth.demoSession) {
    return NextResponse.json({ error: "Sign in to the workspace." }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  try {
    const result = await cancelWorkspace(auth, body.reason);
    const response = NextResponse.json(result);
    if (result.endedSession) {
      revokeDemoSessionCookie((await cookies()).get(demoSessionCookie)?.value);
      applyClearedDemoCookies(response);
    }
    return response;
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 400;
    const message = error instanceof Error ? error.message : "Could not cancel the workspace.";
    return NextResponse.json({ error: message }, { status: Number.isFinite(status) ? status : 400 });
  }
}
