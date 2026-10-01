import { createHash, randomBytes } from "crypto";
import { validEmail, normalizeEmail } from "@/lib/demo-access";
import { packageById } from "@/lib/product-features";
import { attachUserToOrganization, provisionBlankOrganization } from "@/lib/provision-org";
import { listPackages } from "@/lib/subscription-packages";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type PlatformSignup = {
  id: string;
  email: string;
  fullName: string;
  organizationName: string;
  packageId: string;
  tokenHash: string;
  organizationId: string | null;
  stripeSessionId: string | null;
  status: "pending" | "paid" | "provisioned" | "canceled";
};

const memorySignups: Map<string, PlatformSignup> =
  ((globalThis as typeof globalThis & { __homeopsSignups?: Map<string, PlatformSignup> }).__homeopsSignups ??= new Map());

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function newSignupToken() {
  const token = randomBytes(24).toString("hex");
  return { token, hash: sha256(token) };
}

export async function createPlatformSignup(input: {
  email: string;
  fullName: string;
  organizationName: string;
  packageId?: string;
  stripeSessionId?: string | null;
  status?: PlatformSignup["status"];
  tokenHash?: string;
}) {
  const email = normalizeEmail(input.email);
  if (!validEmail(email)) throw new Error("Enter a valid email address.");
  const packages = await listPackages();
  const pkg = packageById(input.packageId, packages);
  const token = input.tokenHash ? { token: "", hash: input.tokenHash } : newSignupToken();
  const row: PlatformSignup = {
    id: crypto.randomUUID(),
    email,
    fullName: input.fullName.trim() || email,
    organizationName: input.organizationName.trim() || "My organization",
    packageId: pkg.id,
    tokenHash: token.hash,
    organizationId: null,
    stripeSessionId: input.stripeSessionId || null,
    status: input.status || "pending",
  };
  memorySignups.set(row.tokenHash, row);
  const admin = createSupabaseAdminClient();
  if (admin) {
    const { data, error } = await admin.from("platform_signups").insert({
      email: row.email,
      full_name: row.fullName,
      organization_name: row.organizationName,
      package_id: row.packageId,
      token_hash: row.tokenHash,
      stripe_session_id: row.stripeSessionId,
      status: row.status,
    }).select("id").single();
    if (error) throw new Error(error.message);
    row.id = data.id;
  }
  return { signup: row, token: token.token };
}

export async function findSignupByToken(token: string) {
  const hash = sha256(token);
  const memory = memorySignups.get(hash);
  if (memory) return memory;
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("platform_signups").select("*").eq("token_hash", hash).maybeSingle();
  if (!data) return null;
  return fromRow(data);
}

export async function findSignupByStripeSession(sessionId: string) {
  for (const row of memorySignups.values()) {
    if (row.stripeSessionId === sessionId) return row;
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("platform_signups").select("*").eq("stripe_session_id", sessionId).maybeSingle();
  return data ? fromRow(data) : null;
}

function fromRow(data: Record<string, unknown>): PlatformSignup {
  return {
    id: String(data.id),
    email: String(data.email),
    fullName: String(data.full_name),
    organizationName: String(data.organization_name),
    packageId: String(data.package_id),
    tokenHash: String(data.token_hash || ""),
    organizationId: data.organization_id ? String(data.organization_id) : null,
    stripeSessionId: data.stripe_session_id ? String(data.stripe_session_id) : null,
    status: data.status as PlatformSignup["status"],
  };
}

export async function markSignup(id: string, patch: Partial<PlatformSignup>) {
  for (const [hash, row] of memorySignups) {
    if (row.id === id) memorySignups.set(hash, { ...row, ...patch });
  }
  const admin = createSupabaseAdminClient();
  if (admin) {
    await admin.from("platform_signups").update({
      status: patch.status,
      organization_id: patch.organizationId,
      stripe_session_id: patch.stripeSessionId,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
  }
}

export async function provisionSignup(signup: PlatformSignup, userId?: string | null) {
  const workspace = await provisionBlankOrganization({
    email: signup.email,
    fullName: signup.fullName,
    organizationName: signup.organizationName,
    packageId: signup.packageId,
    userId,
  });
  const admin = createSupabaseAdminClient();
  if (admin && userId) await attachUserToOrganization(admin, workspace.organizationId, userId);
  await markSignup(signup.id, { organizationId: workspace.organizationId, status: "provisioned" });
  return workspace;
}

export async function ensureAuthUser(email: string, fullName: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (created.data.user) return created.data.user;
  const message = created.error?.message || "";
  if (!/already|registered|exists/i.test(message)) {
    throw new Error(message || "Could not create the login.");
  }
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return listed.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
}
