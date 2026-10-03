import { getDemoSession } from "@/lib/demo-access";
import { blankWorkspaceCookie, memoryWorkspaceById } from "@/lib/provision-org";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export async function getAuthedContext() {
  const supabase = await createSupabaseServerClient();
  const demoSession = await getDemoSession();
  const blankId = (await cookies()).get(blankWorkspaceCookie)?.value;
  const blank = blankId ? memoryWorkspaceById(blankId) : null;
  if (!supabase) {
    if (blank) return { supabase: null, user: null, organizationId: blank.organizationId, role: "owner" as const, demoSession: null };
    return { supabase: null, user: null, organizationId: null, role: demoSession?.role ?? null, demoSession };
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    if (blank) return { supabase: null, user: null, organizationId: blank.organizationId, role: "owner" as const, demoSession: null };
    return { supabase, user: null, organizationId: null, role: demoSession?.role ?? null, demoSession };
  }
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (membership?.organization_id) {
    return { supabase, user, organizationId: membership.organization_id, role: membership.role, demoSession };
  }
  return { supabase, user, organizationId: null, role: membership?.role ?? null, demoSession };
}
