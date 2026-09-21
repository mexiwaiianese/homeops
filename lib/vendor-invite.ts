import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { confirmationCopy, invitationCopy, invitationUrl, sendVendorEmail, sendVendorSms } from "@/lib/vendor-outreach";
import { buildVendorFingerprint, normalizeVendorName } from "@/lib/vendors";
import { parseUsPhone } from "@/lib/vendor-prospects";

type ProspectRow = {
  id: string;
  name: string;
  category_slug: string;
  category_name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  vendor_id: string | null;
  outreach_status: string;
};

export function chooseInviteChannel(prospect: { email?: string | null; phone?: string | null }, requested?: "email" | "sms" | "auto") {
  if (requested === "email" && prospect.email) return { channel: "email" as const, sentTo: prospect.email };
  if (requested === "sms" && parseUsPhone(prospect.phone)) return { channel: "sms" as const, sentTo: prospect.phone as string };
  if (prospect.email) return { channel: "email" as const, sentTo: prospect.email };
  if (parseUsPhone(prospect.phone)) return { channel: "sms" as const, sentTo: prospect.phone as string };
  return null;
}

export async function inviteProspect(input: {
  supabase: SupabaseClient;
  organizationId: string;
  organizationName: string;
  prospect: ProspectRow;
  requestedChannel?: "email" | "sms" | "auto";
  userId?: string | null;
  baseUrl?: string;
}) {
  const destination = chooseInviteChannel(input.prospect, input.requestedChannel);
  if (!destination) {
    return { ok: false as const, error: "No email or phone is available to send an invitation" };
  }

  let vendorId = input.prospect.vendor_id;
  if (!vendorId) {
    const fingerprint = buildVendorFingerprint({
      name: input.prospect.name,
      phone: input.prospect.phone,
      email: input.prospect.email,
      postalCode: input.prospect.postal_code,
    });
    const { data: existing } = await input.supabase
      .from("vendors")
      .select("id,workflow_stage")
      .eq("organization_id", input.organizationId)
      .or(`identity_fingerprint.eq.${fingerprint},normalized_name.eq.${normalizeVendorName(input.prospect.name)}`)
      .limit(1)
      .maybeSingle();
    if (existing) {
      vendorId = existing.id;
    } else {
      const { data: vendor, error } = await input.supabase
        .from("vendors")
        .insert({
          organization_id: input.organizationId,
          name: input.prospect.name,
          normalized_name: normalizeVendorName(input.prospect.name),
          identity_fingerprint: fingerprint,
          trade: input.prospect.category_name,
          email: input.prospect.email,
          phone: input.prospect.phone,
          website: input.prospect.website,
          address1: input.prospect.address1,
          city: input.prospect.city,
          state: input.prospect.state,
          postal_code: input.prospect.postal_code,
          workflow_stage: "invited",
          approval_status: "conditional",
          private_notes: "Sourced from public listing recruitment. Public review rank is not operational performance.",
        })
        .select("id")
        .single();
      if (error || !vendor) return { ok: false as const, error: error?.message || "Could not create vendor candidate" };
      vendorId = vendor.id;
      const { data: category } = await input.supabase
        .from("service_categories")
        .select("id")
        .eq("slug", input.prospect.category_slug)
        .maybeSingle();
      if (category) {
        await input.supabase.from("vendor_services").insert({
          organization_id: input.organizationId,
          vendor_id: vendorId,
          service_category_id: category.id,
          specialty: input.prospect.category_name,
          active: true,
        });
      }
    }
  }

  const token = randomBytes(24).toString("hex");
  const { data: invitation, error: inviteError } = await input.supabase
    .from("vendor_invitations")
    .insert({
      organization_id: input.organizationId,
      prospect_id: input.prospect.id,
      vendor_id: vendorId,
      token,
      channel: destination.channel,
      sent_to: destination.sentTo,
      organization_name: input.organizationName,
      sent_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (inviteError || !invitation) return { ok: false as const, error: inviteError?.message || "Could not create invitation" };

  await input.supabase.from("vendor_prospects").update({
    vendor_id: vendorId,
    outreach_status: "invited",
    updated_at: new Date().toISOString(),
  }).eq("id", input.prospect.id).eq("organization_id", input.organizationId);

  await input.supabase.from("vendors").update({
    workflow_stage: "invited",
    updated_at: new Date().toISOString(),
  }).eq("id", vendorId).eq("organization_id", input.organizationId);

  const url = invitationUrl(token, input.baseUrl);
  const text = invitationCopy({
    organizationName: input.organizationName,
    companyName: input.prospect.name,
    url,
    channel: destination.channel,
  });
  const send = destination.channel === "email"
    ? await sendVendorEmail({ to: destination.sentTo, subject: `Invitation to ${input.organizationName}'s approved vendor program`, text })
    : await sendVendorSms({ to: destination.sentTo, text });

  await input.supabase.from("vendor_outreach_events").insert({
    organization_id: input.organizationId,
    prospect_id: input.prospect.id,
    invitation_id: invitation.id,
    vendor_id: vendorId,
    event_type: send.sent ? "invited" : "invite_failed",
    channel: destination.channel,
    destination: destination.sentTo,
    provider: send.provider,
    notes: send.error || null,
  });

  return {
    ok: true as const,
    invitation,
    vendorId,
    inviteUrl: url,
    channel: destination.channel,
    sentTo: destination.sentTo,
    delivered: send.sent,
    deliveryError: send.error || null,
  };
}

export async function sendRegistrationConfirmation(input: {
  supabase: SupabaseClient;
  organizationId: string;
  invitation: { id: string; channel: "email" | "sms"; sent_to: string; organization_name: string; prospect_id: string; vendor_id: string | null };
  companyName: string;
  email?: string | null;
  phone?: string | null;
}) {
  const email = String(input.email || "").trim();
  const smsTo = parseUsPhone(input.phone) ? String(input.phone).trim() : "";
  const channel: "email" | "sms" = email ? "email" : smsTo ? "sms" : input.invitation.channel;
  const sentTo = email || smsTo || input.invitation.sent_to;
  const text = confirmationCopy({
    organizationName: input.invitation.organization_name,
    companyName: input.companyName,
    channel,
  });
  const send = channel === "email"
    ? await sendVendorEmail({ to: sentTo, subject: `Registration confirmed with ${input.invitation.organization_name}`, text })
    : await sendVendorSms({ to: sentTo, text });
  await input.supabase.from("vendor_outreach_events").insert({
    organization_id: input.organizationId,
    prospect_id: input.invitation.prospect_id,
    invitation_id: input.invitation.id,
    vendor_id: input.invitation.vendor_id,
    event_type: send.sent ? "confirmation_sent" : "confirmation_failed",
    channel,
    destination: sentTo,
    provider: send.provider,
    notes: send.error || null,
  });
  if (send.sent) {
    await input.supabase.from("vendor_invitations").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", input.invitation.id);
  }
  return send;
}
