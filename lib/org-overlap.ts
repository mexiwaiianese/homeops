import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/demo-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Personal inboxes are not a company. Matching @gmail.com must not pull strangers into one org. */
const PUBLIC_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com", "hotmail.com",
  "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "proton.me",
  "protonmail.com", "pm.me", "gmx.com", "mail.com",
]);

export type OrgOverlapMatch = {
  organizationId: string;
  organizationName: string;
  reason: "primary_email" | "email" | "domain";
};

export type OrgOverlap = {
  blocked: boolean;
  matches: OrgOverlapMatch[];
  message: string;
};

type Holder = {
  email: string;
  organizationId: string;
  organizationName: string;
  primary: boolean;
};

function domainOf(email: string) {
  return email.split("@")[1] || "";
}

function uniqueMatches(matches: OrgOverlapMatch[]) {
  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = `${match.organizationId}:${match.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function describeOrgOverlap(_email: string, matches: OrgOverlapMatch[]): OrgOverlap {
  const unique = uniqueMatches(matches);
  const blocked = unique.some((match) => match.reason === "primary_email");
  const message = blocked
    ? "This email is already the main account holder of an organization. It cannot be the main account holder of another one. Sign in with this email, or register the new organization with a different email."
    : "This email or its company domain is already used by an organization. A new organization can duplicate accounts, records, and billing. Select Proceed to open a separate instance. That can be another company, or the same company keeping its own records and billing.";
  return { blocked, matches: unique, message };
}

async function authEmailByUser(admin: SupabaseClient) {
  const emails = new Map<string, string>();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users.length) break;
    for (const user of data.users) {
      if (user.email) emails.set(user.id, normalizeEmail(user.email));
    }
    if (data.users.length < 200) break;
  }
  return emails;
}

async function liveHolders(admin: SupabaseClient): Promise<Holder[]> {
  const [{ data: orgs }, { data: members }, { data: vendorUsers }, emails] = await Promise.all([
    admin.from("organizations").select("id, name"),
    admin.from("organization_members").select("organization_id, user_id, role"),
    admin.from("vendor_users").select("organization_id, email, role"),
    authEmailByUser(admin),
  ]);
  const orgName = new Map((orgs ?? []).map((row) => [row.id, row.name || "Organization"]));
  const holders: Holder[] = [];
  for (const member of members ?? []) {
    const email = emails.get(member.user_id);
    if (!email || !member.organization_id) continue;
    holders.push({
      email,
      organizationId: member.organization_id,
      organizationName: orgName.get(member.organization_id) || "Organization",
      primary: member.role === "owner",
    });
  }
  for (const user of vendorUsers ?? []) {
    const email = normalizeEmail(user.email || "");
    if (!email || !user.organization_id) continue;
    holders.push({
      email,
      organizationId: user.organization_id,
      organizationName: orgName.get(user.organization_id) || "Organization",
      primary: user.role === "owner",
    });
  }
  return holders;
}

function memoryHolders(): Holder[] {
  const memory = (globalThis as typeof globalThis & {
    __homeopsBlankOrgs?: Map<string, { organizationId: string; name: string; ownerEmail: string }>;
  }).__homeopsBlankOrgs;
  if (!memory) return [];
  return [...memory.values()].map((row) => ({
    email: normalizeEmail(row.ownerEmail),
    organizationId: row.organizationId,
    organizationName: row.name,
    primary: true,
  }));
}

export async function findOrgOverlap(emailInput: string, admin?: SupabaseClient | null): Promise<OrgOverlap> {
  const email = normalizeEmail(emailInput);
  const domain = domainOf(email);
  const db = admin === undefined ? createSupabaseAdminClient() : admin;
  const holders = [...memoryHolders(), ...(db ? await liveHolders(db) : [])];
  const matches: OrgOverlapMatch[] = [];
  for (const holder of holders) {
    if (!holder.email) continue;
    if (holder.email === email) {
      matches.push({
        organizationId: holder.organizationId,
        organizationName: holder.organizationName,
        reason: holder.primary ? "primary_email" : "email",
      });
      continue;
    }
    if (domain && !PUBLIC_DOMAINS.has(domain) && domainOf(holder.email) === domain) {
      matches.push({
        organizationId: holder.organizationId,
        organizationName: holder.organizationName,
        reason: "domain",
      });
    }
  }
  return describeOrgOverlap(email, matches);
}
