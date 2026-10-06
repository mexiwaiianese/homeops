import type { SupabaseClient } from "@supabase/supabase-js";
import { PROPERTY_OVERAGE_YEAR_CENTS, publicPackageById } from "@/lib/public-site";
import {
  formatCents,
  nextRenewalDate,
  overageTransactionFeeCents,
  proratedOverageCents,
} from "@/lib/property-overage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const OVERAGE_FEE_NOTE =
  "Moov standard US card fee, excluding card-network interchange: 0.60% + $0.15 per successful charge + $0.15 per transaction. Interchange is added when the card network reports it.";

export type OverageCharge = {
  homeId: string;
  organizationId: string;
  included: number;
  homeCount: number;
  renewsOn: string;
  propertyCents: number;
  transactionFeeCents: number;
  totalCents: number;
  stored: boolean;
  message: string;
};

type SubSnap = {
  packageId: string;
  createdAt: string | null;
  renewsOn: string | null;
  canWriteRenewal: boolean;
};

type MemoryRenewal = { renewsOn: string; anchor: string };

const memoryRenewals: Map<string, MemoryRenewal> =
  ((globalThis as typeof globalThis & { __homeopsRenewals?: Map<string, MemoryRenewal> }).__homeopsRenewals ??= new Map());

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
}

function formatRenewal(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseIsoDate(iso));
}

function chargeMessage(included: number, renewsOn: string, propertyCents: number, feeCents: number, totalCents: number) {
  return `Past the ${included} included: ${formatCents(propertyCents)} prorated through ${formatRenewal(renewsOn)}, plus ${formatCents(feeCents)} transaction fee. ${formatCents(totalCents)} due before card-network interchange.`;
}

function resolveRenewal(snap: { renewsOn: string | null; createdAt: string | null } | null, addedAt: Date) {
  if (snap?.renewsOn) {
    const stored = parseIsoDate(snap.renewsOn);
    if (stored.getTime() > Date.UTC(addedAt.getUTCFullYear(), addedAt.getUTCMonth(), addedAt.getUTCDate())) return stored;
  }
  const anchor = snap?.renewsOn
    ? parseIsoDate(snap.renewsOn)
    : snap?.createdAt
      ? new Date(snap.createdAt)
      : addedAt;
  return nextRenewalDate(anchor, addedAt);
}

async function loadSubscription(organizationId: string, db: SupabaseClient): Promise<{ ok: true; snap: SubSnap | null } | { ok: false }> {
  const full = await db
    .from("organization_subscriptions")
    .select("package_id, created_at, renews_on")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!full.error) {
    if (!full.data) return { ok: true, snap: null };
    return {
      ok: true,
      snap: {
        packageId: full.data.package_id,
        createdAt: full.data.created_at ?? null,
        renewsOn: full.data.renews_on ?? null,
        canWriteRenewal: true,
      },
    };
  }
  const basic = await db
    .from("organization_subscriptions")
    .select("package_id, created_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (basic.error) return { ok: false };
  if (!basic.data) return { ok: true, snap: null };
  return {
    ok: true,
    snap: {
      packageId: basic.data.package_id,
      createdAt: basic.data.created_at ?? null,
      renewsOn: null,
      canWriteRenewal: false,
    },
  };
}

async function writeRenewal(organizationId: string, renewsOn: string, anchor: string, db: SupabaseClient | null, canWrite: boolean) {
  memoryRenewals.set(organizationId, { renewsOn, anchor });
  if (!db || !canWrite) return;
  await db.from("organization_subscriptions").update({ renews_on: renewsOn, updated_at: new Date().toISOString() }).eq("organization_id", organizationId);
}

/** Sets the workspace anniversary one year out. Leaves a future date in place. */
export async function ensureWorkspaceRenewal(organizationId: string, anchor = new Date(), admin?: SupabaseClient | null) {
  const db = admin === undefined ? createSupabaseAdminClient() : admin;
  if (!db) {
    const existing = memoryRenewals.get(organizationId);
    if (existing && parseIsoDate(existing.renewsOn).getTime() > Date.now()) return existing.renewsOn;
    const renewsOn = isoDate(nextRenewalDate(anchor, anchor));
    memoryRenewals.set(organizationId, { renewsOn, anchor: isoDate(anchor) });
    return renewsOn;
  }
  const loaded = await loadSubscription(organizationId, db);
  const snap = loaded.ok ? loaded.snap : null;
  const renewal = resolveRenewal(snap ?? { renewsOn: memoryRenewals.get(organizationId)?.renewsOn ?? null, createdAt: null }, anchor);
  const renewsOn = isoDate(renewal);
  const anchorIso = snap?.createdAt ? isoDate(new Date(snap.createdAt)) : isoDate(anchor);
  if (loaded.ok && snap?.renewsOn !== renewsOn) await writeRenewal(organizationId, renewsOn, anchorIso, db, snap?.canWriteRenewal ?? false);
  return renewsOn;
}

function includedFor(packageId: string | null | undefined) {
  return (publicPackageById(packageId) ?? publicPackageById("core"))?.includedProperties ?? 25;
}

/**
 * After a home is saved, bill it when the workspace is past the plan's included count.
 * The property amount is the prorated $18. The transaction fee is separate.
 */
export async function recordHomeOverage(input: {
  organizationId: string;
  homeId: string;
  addedAt?: Date;
  supabase?: SupabaseClient | null;
}): Promise<OverageCharge | null> {
  const addedAt = input.addedAt ?? new Date();
  const db = createSupabaseAdminClient() ?? input.supabase ?? null;
  const loaded = db ? await loadSubscription(input.organizationId, db) : { ok: true as const, snap: null };
  if (!loaded.ok) return null;
  const snap = loaded.snap;
  const memory = memoryRenewals.get(input.organizationId);
  const renewal = resolveRenewal(
    snap ?? { renewsOn: memory?.renewsOn ?? null, createdAt: null },
    addedAt,
  );
  const renewsOn = isoDate(renewal);
  const included = includedFor(snap?.packageId);
  if (snap?.renewsOn !== renewsOn || !snap) {
    await writeRenewal(input.organizationId, renewsOn, memory?.anchor ?? isoDate(addedAt), db, snap?.canWriteRenewal ?? false);
  }

  let homeCount = 0;
  if (db) {
    const counted = await db.from("homes").select("id", { count: "exact", head: true }).eq("organization_id", input.organizationId);
    homeCount = counted.count ?? 0;
  }
  if (homeCount <= included) return null;

  const propertyCents = proratedOverageCents(addedAt, renewal);
  const transactionFeeCents = overageTransactionFeeCents(propertyCents);
  const totalCents = propertyCents + transactionFeeCents;
  const message = chargeMessage(included, renewsOn, propertyCents, transactionFeeCents, totalCents);
  const charge: OverageCharge = {
    homeId: input.homeId,
    organizationId: input.organizationId,
    included,
    homeCount,
    renewsOn,
    propertyCents,
    transactionFeeCents,
    totalCents,
    stored: false,
    message,
  };
  if (!db) return charge;

  const existing = await db
    .from("property_overage_charges")
    .select("property_cents, transaction_fee_cents, total_cents, renews_on")
    .eq("home_id", input.homeId)
    .maybeSingle();
  if (!existing.error && existing.data) {
    return {
      ...charge,
      propertyCents: existing.data.property_cents,
      transactionFeeCents: existing.data.transaction_fee_cents,
      totalCents: existing.data.total_cents,
      renewsOn: existing.data.renews_on,
      stored: true,
      message: chargeMessage(included, existing.data.renews_on, existing.data.property_cents, existing.data.transaction_fee_cents, existing.data.total_cents),
    };
  }

  const inserted = await db.from("property_overage_charges").insert({
    organization_id: input.organizationId,
    home_id: input.homeId,
    renews_on: renewsOn,
    property_cents: propertyCents,
    transaction_fee_cents: transactionFeeCents,
    total_cents: totalCents,
    annual_cents: PROPERTY_OVERAGE_YEAR_CENTS,
    status: "due",
    fee_note: OVERAGE_FEE_NOTE,
  });
  return { ...charge, stored: !inserted.error };
}
