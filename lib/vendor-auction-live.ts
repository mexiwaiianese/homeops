import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceFits } from "@/lib/auto-assign";
import { explainVendorEligibility } from "@/lib/vendors";
import { leadingBid, nextAutobidAmount, notifyAuctionInvite, bidUrl, type AuctionBid } from "@/lib/vendor-auction";
import { liveAutobidBlock, liveBidGate, vendorPortalTablesReady } from "@/lib/vendor-portal-live";

function vendorDestination(vendor: { email?: string | null; phone?: string | null; vendor_contacts?: Array<{ email?: string | null; phone?: string | null; is_primary?: boolean }> }) {
  const primary = (vendor.vendor_contacts ?? []).find((row) => row.is_primary) || (vendor.vendor_contacts ?? [])[0];
  return {
    email: vendor.email || primary?.email || null,
    phone: vendor.phone || primary?.phone || null,
  };
}

export async function runLiveAutobid(supabase: SupabaseClient, opportunityId: string) {
  const { data: opportunity } = await supabase
    .from("vendor_bid_opportunities")
    .select("*, vendor_bids!opportunity_id(*), vendor_bid_invites(*, vendors(id,name,email,phone,minimum_trip_charge_cents,hourly_rate_cents,trade))")
    .eq("id", opportunityId)
    .single();
  if (!opportunity || opportunity.status !== "open") return;
  let bids: AuctionBid[] = (opportunity.vendor_bids ?? []).map((bid: { id: string; vendor_id: string; amount_cents: number; source: AuctionBid["source"]; status: AuctionBid["status"] }) => ({
    id: bid.id,
    vendorId: bid.vendor_id,
    amountCents: bid.amount_cents,
    source: bid.source,
    status: bid.status,
  }));

  for (const invite of opportunity.vendor_bid_invites ?? []) {
    const vendorId = invite.vendor_id;
    const [{ data: rule }, { data: calendar }] = await Promise.all([
      supabase.from("vendor_autobid_rules").select("*").eq("vendor_id", vendorId).maybeSingle(),
      supabase.from("vendor_calendar_connections").select("*").eq("vendor_id", vendorId).maybeSingle(),
    ]);
    const parsedRule = {
      enabled: Boolean(rule?.enabled),
      maxAmountCents: rule?.max_amount_cents ?? null,
      minAmountCents: rule?.min_amount_cents ?? null,
      undercutCents: rule?.undercut_cents ?? 2500,
      minNoticeHours: rule?.min_notice_hours ?? 4,
      jobDurationHours: rule?.job_duration_hours ?? 2,
    };
    const { data: requestRow } = await supabase.from("maintenance_requests").select("home_id, priority").eq("id", opportunity.maintenance_request_id).maybeSingle();
    const blocked = await liveAutobidBlock(supabase, {
      vendorId,
      rule: parsedRule,
      calendar,
      homeId: requestRow?.home_id,
      title: opportunity.title,
      budgetCents: opportunity.budget_cents,
      neededBy: opportunity.needed_by,
      city: opportunity.city,
      state: opportunity.state,
      emergency: String(requestRow?.priority || "").toLowerCase() === "emergency",
    });
    if (blocked) continue;
    const lead = leadingBid(bids);
    const amount = nextAutobidAmount({
      rule: parsedRule,
      leadingCents: lead && lead.vendorId !== vendorId ? lead.amountCents : null,
      budgetCents: opportunity.budget_cents,
    });
    if (amount == null) continue;
    const existing = bids.find((bid) => bid.vendorId === vendorId && bid.status === "active");
    if (existing && existing.amountCents <= amount) continue;
    const { data: saved } = await supabase.from("vendor_bids").upsert({
      organization_id: opportunity.organization_id,
      opportunity_id: opportunity.id,
      vendor_id: vendorId,
      invite_id: invite.id,
      amount_cents: amount,
      proposed_start: opportunity.needed_by,
      notes: "Autobid placed after calendar confirmed an open slot.",
      source: "autobid",
      status: "active",
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "opportunity_id,vendor_id" }).select("id").single();
    await supabase.from("vendor_bid_invites").update({ status: "bid" }).eq("id", invite.id);
    bids = [
      ...bids.filter((bid) => bid.vendorId !== vendorId),
      { id: saved?.id || existing?.id || `autobid-${vendorId}`, vendorId, amountCents: amount, source: "autobid", status: "active" },
    ];
  }
}

type AuctionJob = {
  id: string;
  home_id: string;
  title: string;
  description?: string | null;
  priority?: string | null;
  estimated_cost_cents?: number | null;
  approved_cost_cents?: number | null;
  service_category_id?: string | null;
};

/**
 * Invite every approved vendor whose services fit the job and whose notification rules accept it.
 * Vendors in `alreadyInvited` are skipped, so this can top up an auction that is already open.
 * Returns the number of invites written.
 */
async function inviteMatchingVendors(input: {
  supabase: SupabaseClient;
  organizationId: string;
  organizationName: string;
  opportunityId: string;
  job: AuctionJob;
  budgetCents: number | null;
  neededBy: string;
  home: { city?: string | null; state?: string | null } | null;
  origin: string;
  notify?: boolean;
  alreadyInvited: Set<string>;
}) {
  const { data: vendorRows } = await input.supabase
    .from("vendors")
    .select("*,vendor_credentials(*),vendor_services(*),vendor_owner_preferences(*),vendor_property_preferences(*),vendor_contacts(*)")
    .eq("organization_id", input.organizationId);

  let invited = 0;
  for (const vendor of vendorRows ?? []) {
    if (input.alreadyInvited.has(vendor.id)) continue;
    const { data: eligibilityRpc, error: eligibilityError } = await input.supabase.rpc("vendor_eligibility", {
      v_id: vendor.id,
      p_home_id: input.job.home_id,
      p_service_category_id: input.job.service_category_id,
    });
    const eligibility = eligibilityError
      ? explainVendorEligibility(vendor, { homeId: input.job.home_id, serviceCategoryId: input.job.service_category_id })
      : { ...explainVendorEligibility(vendor, { homeId: input.job.home_id, serviceCategoryId: input.job.service_category_id }), ...eligibilityRpc };
    if (!eligibility.eligible) continue;
    const services = [vendor.trade, ...((vendor.vendor_services ?? []).map((row: any) => row.specialty).filter(Boolean))];
    if (!input.job.service_category_id && !serviceFits({ ...vendor, services }, input.job.title)) continue;

    if (await vendorPortalTablesReady(input.supabase)) {
      const gate = await liveBidGate(input.supabase, {
        vendorId: vendor.id,
        homeId: input.job.home_id,
        title: input.job.title,
        budgetCents: input.budgetCents,
        neededBy: input.neededBy,
        city: input.home?.city,
        state: input.home?.state,
        emergency: String(input.job.priority || "").toLowerCase() === "emergency",
        vendor: { trade: vendor.trade, emergency_available: vendor.emergency_available, services },
      });
      if (gate.notificationReason) continue;
    }

    const destination = vendorDestination(vendor);
    const { data: invite, error: inviteError } = await input.supabase
      .from("vendor_bid_invites")
      .insert({
        organization_id: input.organizationId,
        opportunity_id: input.opportunityId,
        vendor_id: vendor.id,
        channel: destination.email ? "email" : destination.phone ? "sms" : null,
        sent_to: destination.email || destination.phone,
        status: "invited",
      })
      .select()
      .single();
    if (inviteError || !invite) continue;
    invited += 1;
    if (input.notify === false) {
      await input.supabase.from("vendor_bid_invites").update({
        notified_at: new Date().toISOString(),
        delivery_error: "Demo seed: invite recorded, no message sent",
      }).eq("id", invite.id);
      continue;
    }
    const url = bidUrl(invite.token, input.origin);
    const delivery = await notifyAuctionInvite({
      email: destination.email,
      phone: destination.phone,
      organizationName: input.organizationName,
      vendorName: vendor.name,
      title: input.job.title,
      url,
      budgetCents: input.budgetCents,
      neededBy: input.neededBy,
    });
    await input.supabase.from("vendor_bid_invites").update({
      notified_at: new Date().toISOString(),
      delivery_error: delivery.sent ? null : delivery.error || "Link generated; email/SMS not configured",
      channel: delivery.channel,
      sent_to: delivery.sentTo,
    }).eq("id", invite.id);
  }
  return invited;
}

export async function openLiveAuction(input: {
  supabase: SupabaseClient;
  organizationId: string;
  organizationName: string;
  job: AuctionJob;
  budgetCents: number | null;
  neededBy?: string | null;
  origin: string;
  userId?: string;
  /** False when seeding demo data: invites are recorded but no email or SMS goes out. */
  notify?: boolean;
}) {
  const { data: existing } = await input.supabase
    .from("vendor_bid_opportunities")
    .select("id,status")
    .eq("maintenance_request_id", input.job.id)
    .maybeSingle();
  if (existing?.status === "open") {
    return { opportunityId: existing.id, created: false };
  }
  if (existing?.status === "awarded") {
    throw new Error("This job already has an awarded auction");
  }
  if (existing) {
    await input.supabase.from("vendor_bid_opportunities").delete().eq("id", existing.id);
  }

  const { data: home } = await input.supabase
    .from("homes")
    .select("address1,city,state,postal_code")
    .eq("id", input.job.home_id)
    .maybeSingle();

  const neededBy = input.neededBy || new Date(Date.now() + (input.job.priority === "emergency" ? 8 : 48) * 60 * 60 * 1000).toISOString();
  const { data: opportunity, error } = await input.supabase
    .from("vendor_bid_opportunities")
    .insert({
      organization_id: input.organizationId,
      maintenance_request_id: input.job.id,
      title: input.job.title,
      description: input.job.description || null,
      city: home?.city || null,
      state: home?.state || null,
      postal_code: home?.postal_code || null,
      address1: home?.address1 || null,
      budget_cents: input.budgetCents,
      needed_by: neededBy,
      ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      status: "open",
    })
    .select()
    .single();
  if (error || !opportunity) throw new Error(error?.message || "Could not open auction");

  await inviteMatchingVendors({
    supabase: input.supabase,
    organizationId: input.organizationId,
    organizationName: input.organizationName,
    opportunityId: opportunity.id,
    job: input.job,
    budgetCents: input.budgetCents,
    neededBy,
    home,
    origin: input.origin,
    notify: input.notify,
    alreadyInvited: new Set<string>(),
  });

  await runLiveAutobid(input.supabase, opportunity.id);
  await input.supabase.from("activity_events").insert({
    organization_id: input.organizationId,
    home_id: input.job.home_id,
    subject_type: "maintenance_request",
    subject_id: input.job.id,
    event_type: "vendor_auction_opened",
    body: `Reverse auction opened for ${input.job.title}.`,
    metadata: { opportunityId: opportunity.id, budgetCents: input.budgetCents, neededBy },
  });
  return { opportunityId: opportunity.id, created: true };
}

/**
 * Property-manager board seed for a live organization: open a reverse auction for every approved,
 * unassigned request that does not have one yet. Idempotent, so it is safe to run on every load of
 * a demo sandbox. Returns the maintenance request ids with an open auction afterwards.
 */
export async function seedLiveManagerOpportunities(input: {
  supabase: SupabaseClient;
  organizationId: string;
  organizationName: string;
  origin: string;
}) {
  const [{ data: requests, error }, { data: existing }] = await Promise.all([
    input.supabase
      .from("maintenance_requests")
      .select("id, home_id, title, description, priority, estimated_cost_cents, approved_cost_cents, service_category_id")
      .eq("organization_id", input.organizationId)
      .eq("status", "authorize")
      .is("vendor_id", null),
    input.supabase
      .from("vendor_bid_opportunities")
      .select("id, maintenance_request_id, status, budget_cents, needed_by, city, state, vendor_bid_invites(vendor_id), vendor_bids!opportunity_id(id)")
      .eq("organization_id", input.organizationId),
  ]);
  if (error) throw new Error(error.message);
  const covered = new Set((existing ?? []).map((row) => row.maintenance_request_id as string));
  const created: string[] = [];

  // Auctions that are already open: invite any matching vendor that was missed (matching rules have
  // loosened since the auction opened) and place autobids where none exist yet.
  const requestById = new Map((requests ?? []).map((job) => [job.id as string, job]));
  for (const row of existing ?? []) {
    if (row.status !== "open") continue;
    try {
      const job = requestById.get(row.maintenance_request_id as string);
      const invitedVendorIds = new Set(((row.vendor_bid_invites as Array<{ vendor_id: string }> | null) ?? []).map((invite) => invite.vendor_id));
      let added = 0;
      if (job) {
        added = await inviteMatchingVendors({
          supabase: input.supabase,
          organizationId: input.organizationId,
          organizationName: input.organizationName,
          opportunityId: row.id as string,
          job,
          budgetCents: (row.budget_cents as number | null) ?? null,
          neededBy: (row.needed_by as string | null) || new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          home: { city: row.city as string | null, state: row.state as string | null },
          origin: input.origin,
          notify: false,
          alreadyInvited: invitedVendorIds,
        });
      }
      if (added > 0 || ((row.vendor_bids as unknown[] | null) ?? []).length === 0) {
        await runLiveAutobid(input.supabase, row.id as string);
      }
    } catch {
      // Topping up an open auction is best effort during self-heal.
    }
  }
  for (const job of requests ?? []) {
    if (covered.has(job.id)) continue;
    try {
      const budget = job.approved_cost_cents ?? job.estimated_cost_cents ?? null;
      const result = await openLiveAuction({
        supabase: input.supabase,
        organizationId: input.organizationId,
        organizationName: input.organizationName,
        job,
        budgetCents: budget && budget > 0 ? budget : null,
        origin: input.origin,
        notify: false,
      });
      if (result.created) created.push(job.id);
    } catch {
      // One request that cannot open an auction should not block the rest of the board.
    }
  }
  const openJobIds = [
    ...(existing ?? []).filter((row) => row.status === "open").map((row) => row.maintenance_request_id as string),
    ...created,
  ];
  return { created, openJobIds: [...new Set(openJobIds)] };
}
