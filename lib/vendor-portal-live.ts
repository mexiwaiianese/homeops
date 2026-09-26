import type { SupabaseClient } from "@supabase/supabase-js";
import { autobidBlockReason, type AutobidRule } from "@/lib/vendor-auction";
import {
  biddingAccess,
  defaultNotifyRule,
  notificationBlockReason,
  type NotifyRule,
} from "@/lib/vendor-portal";

let tablesReady: boolean | null = null;

export async function vendorPortalTablesReady(supabase: SupabaseClient) {
  if (tablesReady === true) return true;
  const { error } = await supabase.from("vendor_notification_rules").select("vendor_id").limit(0);
  if (!error) tablesReady = true;
  return !error;
}

function notifyFromRow(row: any, vendor: { services?: string[]; trade?: string | null }): NotifyRule {
  if (!row) return defaultNotifyRule(vendor);
  return {
    enabled: row.enabled !== false,
    services: Array.isArray(row.services) ? row.services : [],
    minAmountCents: row.min_amount_cents ?? null,
    maxAmountCents: row.max_amount_cents ?? null,
    minNoticeHours: row.min_notice_hours ?? 4,
    emergencyOnly: Boolean(row.emergency_only),
    cities: Array.isArray(row.cities) ? row.cities : [],
    states: Array.isArray(row.states) ? row.states : [],
  };
}

export async function liveBidGate(supabase: SupabaseClient, input: {
  vendorId: string;
  homeId?: string | null;
  title: string;
  budgetCents: number | null;
  neededBy?: string | null;
  city?: string | null;
  state?: string | null;
  emergency: boolean;
  vendor?: { services?: string[]; trade?: string | null; emergency_available?: boolean | null };
}) {
  if (!(await vendorPortalTablesReady(supabase))) {
    return { bidBlocked: null as string | null, accessReason: null as string | null, notificationReason: null as string | null, access: null };
  }
  const [{ count: events }, { count: sites }, { data: grants }, { data: ruleRow }, { data: vendorRow }] = await Promise.all([
    supabase.from("vendor_performance_events").select("id", { count: "exact", head: true }).eq("vendor_id", input.vendorId),
    supabase.from("vendor_job_sites").select("id", { count: "exact", head: true }).eq("vendor_id", input.vendorId).not("completed_at", "is", null),
    supabase.from("vendor_bid_grants").select("manager_label, home_ids").eq("vendor_id", input.vendorId),
    supabase.from("vendor_notification_rules").select("*").eq("vendor_id", input.vendorId).maybeSingle(),
    input.vendor ? Promise.resolve({ data: input.vendor }) : supabase.from("vendors").select("trade, emergency_available, vendor_services(specialty)").eq("id", input.vendorId).maybeSingle(),
  ]);
  const vendor = vendorRow && "vendor_services" in (vendorRow as object)
    ? {
        trade: (vendorRow as any).trade as string | null,
        emergency_available: (vendorRow as any).emergency_available as boolean | null,
        services: (((vendorRow as any).vendor_services ?? []) as Array<{ specialty?: string | null }>).map((row) => row.specialty || "").filter(Boolean),
      }
    : input.vendor || { services: [], trade: null, emergency_available: null };
  const successfulJobs = Math.max(events || 0, sites || 0);
  const access = biddingAccess({
    successfulJobs,
    grants: (grants ?? []).map((row: { manager_label?: string; home_ids?: string[] }) => ({
      managerName: row.manager_label || "Property manager",
      homeIds: row.home_ids || [],
    })),
    homeId: input.homeId || "",
  });
  const notificationReason = notificationBlockReason(notifyFromRow(ruleRow, vendor), {
    title: input.title,
    budgetCents: input.budgetCents,
    neededBy: input.neededBy,
    city: input.city,
    state: input.state,
    emergency: input.emergency,
    vendorServices: vendor.services || [],
    vendorTrade: vendor.trade,
    vendorEmergency: vendor.emergency_available,
  });
  return {
    access,
    accessReason: access.allowed ? null : access.reason,
    notificationReason,
    bidBlocked: !access.allowed ? access.reason : notificationReason,
  };
}

export async function liveAutobidBlock(supabase: SupabaseClient, input: {
  vendorId: string;
  rule: AutobidRule;
  calendar: { status?: string | null; metadata?: unknown } | null;
  homeId?: string | null;
  title: string;
  budgetCents: number | null;
  neededBy?: string | null;
  city?: string | null;
  state?: string | null;
  emergency: boolean;
}) {
  const gate = await liveBidGate(supabase, input);
  return autobidBlockReason({
    rule: input.rule,
    calendar: input.calendar as any,
    neededBy: input.neededBy,
    accessReason: gate.accessReason,
    notificationReason: gate.notificationReason,
  });
}
