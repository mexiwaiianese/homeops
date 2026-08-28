import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getAuthedContext() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { supabase: null, user: null, organizationId: null };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, organizationId: null };
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  return { supabase, user, organizationId: membership?.organization_id ?? null, role: membership?.role ?? null };
}
