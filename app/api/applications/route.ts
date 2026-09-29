import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { listDemoApplications } from "@/lib/application-demo";
import { listLiveApplications } from "@/lib/application-live";
import { screeningProviderConfigured } from "@/lib/applications";

export async function GET() {
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase) {
    return NextResponse.json({
      mode: "demo",
      applications: listDemoApplications(),
      screening: screeningProviderConfigured() ? "provider" : "manual",
    });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const applications = await listLiveApplications(supabase, organizationId);
  return NextResponse.json({
    mode: "live",
    applications,
    screening: screeningProviderConfigured() ? "provider" : "manual",
  });
}
