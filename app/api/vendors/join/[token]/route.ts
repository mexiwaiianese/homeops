import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { findDemoProspectByToken, getDemoOutreach, markDemoRegistered } from "@/lib/vendor-prospect-demo";
import { sendRegistrationConfirmation } from "@/lib/vendor-invite";
import { normalizeVendorName } from "@/lib/vendors";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const demo = findDemoProspectByToken(token);
  if (demo) {
    const outreach = getDemoOutreach(demo.sourcePlaceId);
    return NextResponse.json({
      mode: "demo",
      organizationName: "HomeOps Demo Management",
      companyName: outreach.companyName || demo.name,
      categoryName: demo.categoryName,
      registered: outreach.status === "registered",
      registeredAt: outreach.registeredAt || null,
      contact: { email: demo.email, phone: demo.phone },
    });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Registration is unavailable until the backend is connected." }, { status: 503 });
  const { data: invitation } = await admin
    .from("vendor_invitations")
    .select("id,organization_name,channel,sent_to,expires_at,active,registered_at,vendor_id,prospect_id,vendor_prospects(name,category_name,email,phone)")
    .eq("token", token)
    .maybeSingle();
  if (!invitation || invitation.active === false) return NextResponse.json({ error: "This invitation is invalid." }, { status: 404 });
  if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) return NextResponse.json({ error: "This invitation has expired." }, { status: 410 });
  const prospect = Array.isArray(invitation.vendor_prospects) ? invitation.vendor_prospects[0] : invitation.vendor_prospects;
  return NextResponse.json({
    mode: "live",
    organizationName: invitation.organization_name,
    companyName: prospect?.name,
    categoryName: prospect?.category_name,
    registered: Boolean(invitation.registered_at),
    registeredAt: invitation.registered_at,
    contact: { email: prospect?.email, phone: prospect?.phone },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json().catch(() => ({}));
  const companyName = String(body.companyName || "").trim();
  const contactName = String(body.contactName || "").trim();
  const email = String(body.email || "").trim();
  const phone = String(body.phone || "").trim();
  if (!companyName || !contactName) return NextResponse.json({ error: "Company name and a contact name are required." }, { status: 400 });
  if (!email && !phone) return NextResponse.json({ error: "Provide an email or mobile number so we can confirm registration." }, { status: 400 });

  const demo = findDemoProspectByToken(token);
  if (demo) {
    const outreach = markDemoRegistered(token, companyName);
    return NextResponse.json({
      ok: true,
      mode: "demo",
      registered: true,
      confirmation: `${companyName} is registered with HomeOps Demo Management's approved vendor program.`,
      registeredAt: outreach?.registeredAt || new Date().toISOString(),
    }, { status: 201 });
  }

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Registration is unavailable until the backend is connected." }, { status: 503 });
  const { data: invitation } = await admin
    .from("vendor_invitations")
    .select("*, vendor_prospects(*)")
    .eq("token", token)
    .maybeSingle();
  if (!invitation || invitation.active === false) return NextResponse.json({ error: "This invitation is invalid." }, { status: 404 });
  if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) return NextResponse.json({ error: "This invitation has expired." }, { status: 410 });
  const prospect = Array.isArray(invitation.vendor_prospects) ? invitation.vendor_prospects[0] : invitation.vendor_prospects;

  if (invitation.registered_at) {
    return NextResponse.json({
      ok: true,
      registered: true,
      alreadyRegistered: true,
      confirmation: `${prospect?.name || companyName} is already registered.`,
      registeredAt: invitation.registered_at,
    });
  }

  const now = new Date().toISOString();
  const vendorId = invitation.vendor_id;
  if (vendorId) {
    const { error } = await admin.from("vendors").update({
      name: companyName,
      legal_name: String(body.legalName || "").trim() || null,
      normalized_name: normalizeVendorName(companyName),
      email,
      phone,
      website: String(body.website || "").trim() || null,
      city: String(body.city || "").trim() || null,
      state: String(body.state || "").trim().toUpperCase().slice(0, 2) || null,
      postal_code: String(body.postalCode || "").trim() || null,
      emergency_available: Boolean(body.emergencyAvailable),
      after_hours_available: Boolean(body.afterHoursAvailable),
      workflow_stage: "application_submitted",
      application_submitted_at: now,
      updated_at: now,
    }).eq("id", vendorId).eq("organization_id", invitation.organization_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await admin.from("vendor_contacts").insert({
      organization_id: invitation.organization_id,
      vendor_id: vendorId,
      full_name: contactName,
      email: email || null,
      phone: phone || null,
      contact_type: "owner",
      is_primary: true,
    });
    await admin.from("vendor_status_history").insert({
      organization_id: invitation.organization_id,
      vendor_id: vendorId,
      from_workflow_stage: "invited",
      to_workflow_stage: "application_submitted",
      from_approval_status: "conditional",
      to_approval_status: "conditional",
      reason: "Vendor completed public registration",
      metadata: { source: "vendor_invitation" },
    });
  }

  await admin.from("vendor_invitations").update({ registered_at: now }).eq("id", invitation.id);
  await admin.from("vendor_prospects").update({
    outreach_status: "registered",
    name: companyName,
    email: email || prospect?.email,
    phone: phone || prospect?.phone,
    updated_at: now,
  }).eq("id", invitation.prospect_id);
  await admin.from("vendor_outreach_events").insert({
    organization_id: invitation.organization_id,
    prospect_id: invitation.prospect_id,
    invitation_id: invitation.id,
    vendor_id: vendorId,
    event_type: "registered",
    channel: invitation.channel,
    destination: email || phone,
    notes: "Public registration submitted",
  });

  const confirmation = await sendRegistrationConfirmation({
    supabase: admin,
    organizationId: invitation.organization_id,
    invitation: { ...invitation, channel: invitation.channel === "sms" ? "sms" : "email" },
    companyName,
    email,
    phone,
  });

  return NextResponse.json({
    ok: true,
    registered: true,
    alreadyRegistered: false,
    confirmation: `${companyName} is registered with ${invitation.organization_name}'s approved vendor program.`,
    registeredAt: now,
    confirmationDelivered: confirmation.sent,
  }, { status: 201 });
}
