import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { billingView } from "@/lib/workspace-cancel";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await getAuthedContext();
  if (!auth.organizationId && !auth.demoSession) {
    return NextResponse.json({ error: "Sign in to the workspace." }, { status: 401 });
  }
  return NextResponse.json(await billingView(auth));
}
