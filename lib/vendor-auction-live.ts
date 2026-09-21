import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceFits } from "@/lib/auto-assign";
import { explainVendorEligibility } from "@/lib/vendors";
import { autobidBlockReason, leadingBid, nextAutobidAmount, notifyAuctionInvite, bidUrl, type AuctionBid } from "@/lib/vendor-auction";

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
    .select("*, vendor_bids(*), vendor_bid_invites(*, vendors(id,name,email,phone,minimum_trip_charge_cents,hourly_rate_cents,trade))")
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
    const blocked = autobidBlockReason({
      rule: parsedRule,
      calendar,
      neededBy: opportunity.needed_by,
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

export async function openLiveAuction(input: {
  supabase: SupabaseClient;
  organizationId: string;
  organizationName: string;
  job: {
    id: string;
    home_id: string;
    title: string;
    description?: string | null;
    priority?: string | null;
    estimated_cost_cents?: number | null;
    approved_cost_cents?: number | null;
    service_category_id?: string | null;
  };
  budgetCents: number | null;
  neededBy?: string | null;
  origin: string;
  userId?: string;
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

  const { data: vendorRows } = await input.supabase
    .from("vendors")
    .select("*,vendor_credentials(*),vendor_services(*),vendor_owner_preferences(*),vendor_property_preferences(*),vendor_contacts(*)")
    .eq("organization_id", input.organizationId);

  for (const vendor of vendorRows ?? []) {
    const { data: eligibilityRpc, error: eligibilityError } = await input.supabase.rpc("vendor_eligibility", {
      v_id: vendor.id,
      p_home_id: input.job.home_id,
      p_service_category_id: input.job.service_category_id,
    });
    const eligibility = eligibilityError
      ? explainVendorEligibility(vendor, { homeId: input.job.home_id, serviceCategoryId: input.job.service_category_id })
      : { ...explainVendorEligibility(vendor, { homeId: input.job.home_id, serviceCategoryId: input.job.service_category_id }), ...eligibilityRpc };
    if (!eligibility.eligible) continue;
    if (!input.job.service_category_id && !serviceFits({
      ...vendor,
      services: [vendor.trade, ...((vendor.vendor_services ?? []).map((row: any) => row.specialty).filter(Boolean))],
    }, input.job.title)) continue;

    const destination = vendorDestination(vendor);
    const { data: invite, error: inviteError } = await input.supabase
      .from("vendor_bid_invites")
      .insert({
        organization_id: input.organizationId,
        opportunity_id: opportunity.id,
        vendor_id: vendor.id,
        channel: destination.email ? "email" : destination.phone ? "sms" : null,
        sent_to: destination.email || destination.phone,
        status: "invited",
      })
      .select()
      .single();
    if (inviteError || !invite) continue;
    const url = bidUrl(invite.token, input.origin);
    const delivery = await notifyAuctionInvite({
      email: destination.email,
      phone: destination.phone,
      organizationName: input.organizationName,
      vendorName: vendor.name,
      title: input.job.title,
      url,
      budgetCents: input.budgetCents,
      neededBy,
    });
    await input.supabase.from("vendor_bid_invites").update({
      notified_at: new Date().toISOString(),
      delivery_error: delivery.sent ? null : delivery.error || "Link generated; email/SMS not configured",
      channel: delivery.channel,
      sent_to: delivery.sentTo,
    }).eq("id", invite.id);
  }

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
