import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
import { getDemoOrgSettings, parseOrgSettings, setDemoOrgSettings } from "@/lib/org-settings";

export async function GET() {
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase) return NextResponse.json({ mode: "demo", settings: getDemoOrgSettings() });
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { data, error } = await supabase.from("organizations").select("id,name,settings").eq("id", organizationId).maybeSingle();
  if (error || !data) return NextResponse.json({ error: error?.message || "Organization not found" }, { status: 400 });
  return NextResponse.json({ mode: "live", settings: parseOrgSettings(data.settings) });
}

export async function PATCH(request: Request) {
  const { supabase, user, organizationId, role } = await getAuthedContext();
  const body = await request.json().catch(() => ({}));
  const autoAssignAlwaysOn = body.autoAssignAlwaysOn === true;
  if (!supabase) {
    return NextResponse.json({ mode: "demo", settings: setDemoOrgSettings({ autoAssignAlwaysOn }) });
  }
  if (!user || !organizationId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!role || !["owner", "admin", "manager"].includes(role)) {
    return NextResponse.json({ error: "Manager access required" }, { status: 403 });
  }
  const { data: current, error: readError } = await supabase.from("organizations").select("settings").eq("id", organizationId).maybeSingle();
  if (readError || !current) return NextResponse.json({ error: readError?.message || "Organization not found" }, { status: 400 });
  const settings = { ...parseOrgSettings(current.settings), autoAssignAlwaysOn };
  const { data, error } = await supabase
    .from("organizations")
    .update({ settings })
    .eq("id", organizationId)
    .select("settings")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ mode: "live", settings: parseOrgSettings(data.settings) });
}
