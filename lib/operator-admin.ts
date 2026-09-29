import { getAuthedContext } from "@/lib/backend";

/** The only Google account that may open operator tools. */
export const OPERATOR_ADMIN_EMAIL = "nathan@dbx.dev";

type AuthLike = {
  email?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: { provider?: string };
  identities?: { provider?: string }[] | null;
} | null | undefined;

/** True only for a confirmed Google sign-in whose email is the operator admin. */
export function isOperatorAdmin(user: AuthLike) {
  if (!user?.email || !user.email_confirmed_at || user.email.toLowerCase() !== OPERATOR_ADMIN_EMAIL) return false;
  const providers = [user.app_metadata?.provider, ...(user.identities ?? []).map((identity) => identity.provider)];
  return providers.includes("google");
}

export async function getOperatorAdmin() {
  const { user } = await getAuthedContext();
  return { user, allowed: isOperatorAdmin(user) };
}
