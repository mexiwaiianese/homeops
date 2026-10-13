import { foundRedirect } from "@/lib/http-security";
import { requireBooksManager } from "@/lib/qbo/connection";
import { appOrigin, oauthState, quickBooksAuthorizeUrl, quickBooksConfigured, quickBooksRedirectUri } from "@/lib/qbo/quickbooks";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = appOrigin(request);
  const auth = await requireBooksManager();
  if (!auth.ok) return foundRedirect(new URL("/financials?qbo=auth", origin));
  if (!quickBooksConfigured()) return foundRedirect(new URL("/financials?qbo=unconfigured", origin));
  try {
    const state = oauthState({ organizationId: auth.organizationId, userId: auth.userId, returnTo: "/financials?qbo=connected" });
    return foundRedirect(quickBooksAuthorizeUrl({ state, redirectUri: quickBooksRedirectUri(origin) }));
  } catch {
    return foundRedirect(new URL("/financials?qbo=setup", origin));
  }
}
