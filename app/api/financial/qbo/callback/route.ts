import { foundRedirect, sameOriginPath } from "@/lib/http-security";
import { saveQboConnection, sessionFor, updateQboConnection } from "@/lib/qbo/connection";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { appOrigin, exchangeQuickBooksCode, quickBooksRedirectUri, quickBooksRequest, verifyOauthState } from "@/lib/qbo/quickbooks";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = appOrigin(request);
  const state = verifyOauthState(url.searchParams.get("state") || "");
  const code = url.searchParams.get("code") || "";
  const realmId = url.searchParams.get("realmId") || "";
  if (!state || !code || !realmId) return foundRedirect(new URL("/financials?qbo=invalid", origin));
  const admin = createSupabaseAdminClient();
  if (!admin) return foundRedirect(new URL("/financials?qbo=setup", origin));
  try {
    const credentials = await exchangeQuickBooksCode({ code, redirectUri: quickBooksRedirectUri(origin) });
    const connection = await saveQboConnection(admin, {
      organizationId: state.organizationId!,
      userId: state.userId,
      realmId,
      credentials,
    });
    try {
      const info = await quickBooksRequest(sessionFor(admin, connection), `companyinfo/${encodeURIComponent(realmId)}`);
      const company = info.CompanyInfo as { CompanyName?: string } | undefined;
      if (company?.CompanyName) await updateQboConnection(admin, state.organizationId!, { company_name: company.CompanyName });
    } catch {
      // The connection is saved. The next sync can read the company name.
    }
    const next = sameOriginPath(state.returnTo, "/financials?qbo=connected");
    return foundRedirect(new URL(next, origin));
  } catch {
    return foundRedirect(new URL("/financials?qbo=failed", origin));
  }
}
