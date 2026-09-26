import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getAuthedContext } from "@/lib/backend";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { owners as demoOwners } from "@/lib/data";

export const demoOwnerSessionCookie = "homeops_owner_demo";

export type OwnerPortalAccess =
  | { mode: "demo"; ownerId: string; db: null; organizationId: null; preview: boolean; userId: null }
  | { mode: "live"; ownerId: string; db: SupabaseClient; organizationId: string; preview: boolean; userId: string }
  | { mode: "error"; status: number; error: string };

// Resolves who the portal is acting as.
// - Demo: cookie set by the demo picker, or ?ownerId= for manager preview.
// - Live: an organization member may preview any owner in their org with ?ownerId=.
//   Otherwise the signed-in user (magic link, Google, or Apple) must map to owner_users.
//   First sign-in links by verified email so managers only need to enter the owner's address.
export async function ownerPortalAccess(request?: Request): Promise<OwnerPortalAccess> {
  const requestedOwner = request ? new URL(request.url).searchParams.get("ownerId") : null;
  const { supabase, user, organizationId } = await getAuthedContext();

  if (!supabase) {
    const cookieOwner = (await cookies()).get(demoOwnerSessionCookie)?.value;
    const ownerId = requestedOwner || cookieOwner;
    const owner = demoOwners.find((row) => row.id === ownerId);
    if (!owner) return { mode: "error", status: 401, error: "Choose an owner to open the portal." };
    return { mode: "demo", ownerId: owner.id, db: null, organizationId: null, preview: Boolean(requestedOwner && requestedOwner !== cookieOwner), userId: null };
  }

  if (!user) return { mode: "error", status: 401, error: "Sign in to open your owner portal." };

  if (organizationId) {
    if (!requestedOwner) return { mode: "error", status: 400, error: "Managers preview the portal from an owner record (add ?ownerId=)." };
    const { data: owner } = await supabase.from("owners").select("id").eq("id", requestedOwner).eq("organization_id", organizationId).maybeSingle();
    if (!owner) return { mode: "error", status: 404, error: "Owner not found in this organization." };
    return { mode: "live", ownerId: owner.id, db: supabase, organizationId, preview: true, userId: user.id };
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return { mode: "error", status: 503, error: "The owner portal requires the server service-role key." };

  const { data: linked } = await admin.from("owner_users").select("id, owner_id, organization_id").eq("auth_user_id", user.id).maybeSingle();
  let link = linked;
  if (!link && user.email) {
    // First login: attach this auth identity (email, Google, Apple) to the pre-registered owner email.
    const emailVerified = Boolean(user.email_confirmed_at || (user.user_metadata as Record<string, unknown> | undefined)?.email_verified);
    if (emailVerified) {
      const { data: byEmail } = await admin.from("owner_users").select("id, owner_id, organization_id").ilike("email", user.email).is("auth_user_id", null).limit(1).maybeSingle();
      if (byEmail) {
        await admin.from("owner_users").update({ auth_user_id: user.id, last_sign_in_provider: user.app_metadata?.provider || null, last_seen_at: new Date().toISOString() }).eq("id", byEmail.id);
        link = byEmail;
      }
    }
  } else if (link) {
    void admin.from("owner_users").update({ last_sign_in_provider: user.app_metadata?.provider || null, last_seen_at: new Date().toISOString() }).eq("id", link.id);
  }
  if (!link) return { mode: "error", status: 403, error: "This login is not linked to an owner account. Ask your property manager to invite this email." };
  return { mode: "live", ownerId: link.owner_id, db: admin, organizationId: link.organization_id, preview: false, userId: user.id };
}
