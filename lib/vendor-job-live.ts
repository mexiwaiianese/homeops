import type { SupabaseClient } from "@supabase/supabase-js";

export async function ensureLiveJobSite(input: {
  supabase: SupabaseClient;
  organizationId: string;
  jobId: string;
  vendorId: string;
  quotedAmountCents?: number | null;
}) {
  const { data: existing } = await input.supabase
    .from("vendor_job_sites")
    .select("*")
    .eq("maintenance_request_id", input.jobId)
    .maybeSingle();
  if (existing) {
    if (existing.vendor_id !== input.vendorId) {
      await input.supabase.from("vendor_job_sites").update({
        vendor_id: input.vendorId,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    }
    return existing;
  }

  const { data: opportunity } = await input.supabase
    .from("vendor_bid_opportunities")
    .select("id, starts_at, vendor_bid_invites(vendor_id, notified_at, viewed_at), vendor_bids(vendor_id, submitted_at)")
    .eq("maintenance_request_id", input.jobId)
    .maybeSingle();
  const invite = (opportunity?.vendor_bid_invites ?? []).find((row: { vendor_id: string }) => row.vendor_id === input.vendorId);
  const bid = (opportunity?.vendor_bids ?? []).find((row: { vendor_id: string }) => row.vendor_id === input.vendorId);
  const notifiedAt = invite?.notified_at || opportunity?.starts_at || null;
  const firstResponseAt = [invite?.viewed_at, bid?.submitted_at].filter(Boolean).sort()[0] || null;

  const { data: created, error } = await input.supabase.from("vendor_job_sites").insert({
    organization_id: input.organizationId,
    vendor_id: input.vendorId,
    maintenance_request_id: input.jobId,
    notified_at: notifiedAt,
    first_response_at: firstResponseAt,
    awarded_at: new Date().toISOString(),
    quoted_amount_cents: input.quotedAmountCents ?? null,
  }).select().single();
  if (error) throw new Error(error.message);
  return created;
}
