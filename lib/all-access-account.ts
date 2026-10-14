// A workspace login that is not the platform admin.
// The admin account (OPERATOR_ADMIN_EMAIL) opens recruitment, packages, and org flags.
// This account opens the product with every feature on. The admin tools screen signs into it;
// the two logins are never the same address.

import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";
import { OPERATOR_ADMIN_EMAIL } from "@/lib/operator-admin";
import { ALL_FEATURES_ON, DEFAULT_PACKAGES, FEATURE_KEYS } from "@/lib/product-features";
import { memoryWorkspaceByEmail, rememberMemoryWorkspace, type BlankWorkspace } from "@/lib/provision-org";
import { ensureWorkspaceRenewal } from "@/lib/property-overage-billing";
import { getOrgSubscription, hasStoredOrgSubscription, saveOrgSubscription, savePackage } from "@/lib/subscription-packages";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const ALL_ACCESS_ORG_SLUG = "portonos-all-access";
export const ALL_ACCESS_ORG_NAME = "portonOS all-access";
const ALL_ACCESS_MEMORY_ID = "11111111-1111-4111-8111-111111111111";
const PORTFOLIO_ID = "portfolio";

export function allAccessEmail() {
  const email = (process.env.ALL_ACCESS_EMAIL || "all-access@dbx.dev").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("ALL_ACCESS_EMAIL is not a valid email address.");
  }
  if (email === OPERATOR_ADMIN_EMAIL) {
    throw new Error("ALL_ACCESS_EMAIL has to be a different address from the platform admin.");
  }
  return email;
}

export function isAllAccessOrganization(input: { slug?: string | null; ownerEmail?: string | null }) {
  if (input.slug === ALL_ACCESS_ORG_SLUG) return true;
  try {
    return (input.ownerEmail || "").trim().toLowerCase() === allAccessEmail();
  } catch {
    return false;
  }
}

async function ensurePortfolioPackage(admin: SupabaseClient) {
  const { data, error } = await admin.from("subscription_packages").select("id").eq("id", PORTFOLIO_ID).maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return;
  const portfolio = DEFAULT_PACKAGES.find((row) => row.id === PORTFOLIO_ID);
  if (!portfolio) throw new Error("Portfolio package is missing.");
  await savePackage({ ...portfolio, features: { ...portfolio.features } }, admin);
}

async function grantAllFeatures(organizationId: string, admin: SupabaseClient | null) {
  const fullAccess = {
    organizationId,
    packageId: PORTFOLIO_ID,
    overrides: { ...ALL_FEATURES_ON },
    status: "active" as const,
  };
  if (!admin) {
    if (!hasStoredOrgSubscription(organizationId)) await saveOrgSubscription(fullAccess, null);
    await ensureWorkspaceRenewal(organizationId, new Date(), null);
    return;
  }
  await ensurePortfolioPackage(admin);
  const existing = await admin.from("organization_subscriptions").select("organization_id, feature_overrides, package_id, status").eq("organization_id", organizationId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (!existing.data) {
    await saveOrgSubscription(fullAccess, admin);
  } else {
    const sub = await getOrgSubscription(organizationId, admin);
    const explicitOff = FEATURE_KEYS.some((key) => sub.overrides[key] === false);
    const allOn = FEATURE_KEYS.every((key) => sub.features[key]);
    if (!explicitOff && (!allOn || sub.packageId !== PORTFOLIO_ID || sub.status !== "active")) {
      const stripeCustomerId = "stripeCustomerId" in sub ? sub.stripeCustomerId : null;
      const stripeSubscriptionId = "stripeSubscriptionId" in sub ? sub.stripeSubscriptionId : null;
      await saveOrgSubscription({
        ...fullAccess,
        stripeCustomerId,
        stripeSubscriptionId,
      }, admin);
    }
  }
  await ensureWorkspaceRenewal(organizationId, new Date(), admin);
}

function ensureMemoryAccount(): BlankWorkspace {
  const email = allAccessEmail();
  const existing = memoryWorkspaceByEmail(email);
  if (existing) return existing;
  return rememberMemoryWorkspace({
    organizationId: ALL_ACCESS_MEMORY_ID,
    slug: ALL_ACCESS_ORG_SLUG,
    name: ALL_ACCESS_ORG_NAME,
    packageId: PORTFOLIO_ID,
    ownerEmail: email,
    fullName: "All-access",
  });
}

async function ensureAuthUserId(admin: SupabaseClient, email: string) {
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: "All-access" },
  });
  if (created.data.user) return created.data.user.id;
  const message = created.error?.message || "";
  if (!/already|registered|exists/i.test(message)) {
    throw new Error(message || "Could not create the all-access login.");
  }
  const linked = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const userId = linked.data.user?.id;
  if (!userId) throw new Error(linked.error?.message || "The all-access login exists, but its user id could not be read.");
  return userId;
}

async function organizationForUser(admin: SupabaseClient, userId: string) {
  const { data: memberships, error } = await admin.from("organization_members").select("organization_id").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const ids = (memberships ?? []).map((row) => row.organization_id).filter(Boolean);
  if (!ids.length) return null;
  const { data: orgs, error: orgError } = await admin.from("organizations").select("id, slug, name").in("id", ids);
  if (orgError) throw new Error(orgError.message);
  const mine = (orgs ?? []).find((row) => row.slug === ALL_ACCESS_ORG_SLUG);
  const others = (orgs ?? []).filter((row) => row.slug !== ALL_ACCESS_ORG_SLUG);
  if (others.length) {
    throw new Error(`${allAccessEmail()} already belongs to another organization. Set ALL_ACCESS_EMAIL to an unused address.`);
  }
  return mine ?? null;
}

async function ensureLiveAccount(admin: SupabaseClient): Promise<BlankWorkspace> {
  const email = allAccessEmail();
  const userId = await ensureAuthUserId(admin, email);
  let org = await organizationForUser(admin, userId);
  if (!org) {
    const found = await admin.from("organizations").select("id, slug, name").eq("slug", ALL_ACCESS_ORG_SLUG).maybeSingle();
    if (found.error) throw new Error(found.error.message);
    org = found.data;
  }
  if (!org) {
    const inserted = await admin.from("organizations").insert({ name: ALL_ACCESS_ORG_NAME, slug: ALL_ACCESS_ORG_SLUG }).select("id, slug, name").single();
    if (inserted.data) {
      org = inserted.data;
    } else if (inserted.error && /duplicate|unique/i.test(inserted.error.message)) {
      const again = await admin.from("organizations").select("id, slug, name").eq("slug", ALL_ACCESS_ORG_SLUG).maybeSingle();
      if (again.error || !again.data) throw new Error(again.error?.message || inserted.error.message);
      org = again.data;
    } else {
      throw new Error(inserted.error?.message || "Could not create the all-access organization.");
    }
  }
  const { data: members, error: memberError } = await admin.from("organization_members").select("user_id").eq("organization_id", org.id);
  if (memberError) throw new Error(memberError.message);
  const strangers = (members ?? []).filter((row) => row.user_id !== userId);
  if (strangers.length) throw new Error("The all-access organization slug is already used by another account.");
  if (!(members ?? []).some((row) => row.user_id === userId)) {
    const attached = await admin.from("organization_members").upsert({
      organization_id: org.id,
      user_id: userId,
      role: "owner",
    }, { onConflict: "organization_id,user_id" });
    if (attached.error) throw new Error(attached.error.message);
  }
  await grantAllFeatures(org.id, admin);
  return { organizationId: org.id, slug: org.slug, name: org.name, packageId: PORTFOLIO_ID, ownerEmail: email };
}

export async function ensureAllAccessAccount(admin?: SupabaseClient | null): Promise<BlankWorkspace> {
  if (!admin) {
    const workspace = ensureMemoryAccount();
    await grantAllFeatures(workspace.organizationId, null);
    return { ...workspace, packageId: PORTFOLIO_ID, ownerEmail: allAccessEmail() };
  }
  return ensureLiveAccount(admin);
}

/** Sign the current browser in as the all-access user. Does not send email. */
export async function signInAllAccessAccount(admin: SupabaseClient) {
  const email = allAccessEmail();
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    throw new Error("The public Supabase key is missing, so this browser cannot sign in as the all-access account.");
  }
  const existing = await supabase.auth.getUser();
  if (existing.data.user?.email?.toLowerCase() === email) return;
  if (existing.data.user) await supabase.auth.signOut({ scope: "local" });

  const generated = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = generated.data?.properties?.hashed_token;
  if (generated.error || !tokenHash) {
    throw new Error(generated.error?.message || "Could not sign in to the all-access account.");
  }
  const preferred: EmailOtpType = generated.data.properties?.verification_type === "magiclink" ? "magiclink" : "email";
  const types: EmailOtpType[] = preferred === "magiclink" ? ["magiclink", "email"] : ["email", "magiclink"];
  let lastError = "Sign-in did not return a user.";
  for (const type of types) {
    const verify = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (verify.data.user) return;
    lastError = verify.error?.message || lastError;
    if (!/invalid or has expired/i.test(lastError)) break;
  }
  throw new Error(lastError);
}
