import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { listDemoApplications } from "@/lib/application-demo";
import { listLiveApplications, liveApplicantPayUrl } from "@/lib/application-live";
import { screeningDeskMode } from "@/lib/applications";
import { applicantPayLink, getDemoOrgSettings } from "@/lib/org-settings";

export async function GET() {
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase) {
    const screeningPayUrl = applicantPayLink("demo", getDemoOrgSettings().rentspreeApplicantPayUrl);
    return NextResponse.json({
      mode: "demo",
      applications: listDemoApplications(),
      screening: screeningDeskMode(screeningPayUrl),
      screeningPayUrl,
      rentspreeApplicantPayUrl: getDemoOrgSettings().rentspreeApplicantPayUrl,
    });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const [applications, screeningPayUrl] = await Promise.all([
    listLiveApplications(supabase, organizationId),
    liveApplicantPayUrl(supabase, organizationId),
  ]);
  return NextResponse.json({
    mode: "live",
    applications,
    screening: screeningDeskMode(screeningPayUrl),
    screeningPayUrl,
    rentspreeApplicantPayUrl: screeningPayUrl || "",
  });
}
