import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { payDemoBill } from "@/lib/books-demo";
import { payLiveBill } from "@/lib/books-live";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase) {
    const result = payDemoBill(id);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ mode: "demo", ...result });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const result = await payLiveBill(supabase, organizationId, id);
    return NextResponse.json({ mode: "live", ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not pay bill" }, { status: 400 });
  }
}
