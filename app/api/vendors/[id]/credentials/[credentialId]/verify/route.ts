import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/backend";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; credentialId: string }> },
) {
  const { supabase, user, organizationId } = await getAuthedContext();
  if (!supabase || !user || !organizationId)
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  const { id, credentialId } = await params;
  const body = await request.json().catch(() => ({}));
  const provider = String(
    body.provider ||
      process.env.CREDENTIAL_VERIFICATION_PROVIDER ||
      "configured-provider",
  );
  const { data: credential } = await supabase
    .from("vendor_credentials")
    .select("id")
    .eq("id", credentialId)
    .eq("vendor_id", id)
    .eq("organization_id", organizationId)
    .single();
  if (!credential)
    return NextResponse.json(
      { error: "Credential not found" },
      { status: 404 },
    );
  const { data, error } = await supabase
    .from("vendor_credential_verifications")
    .insert({
      organization_id: organizationId,
      vendor_id: id,
      credential_id: credentialId,
      provider,
      requested_by: user.id,
      status: "queued",
    })
    .select()
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  const { error: invokeError } = await supabase.functions.invoke(
    "verify-vendor-credential",
    { body: { verificationId: data.id } },
  );
  return NextResponse.json(
    {
      verification: data,
      queued: !invokeError,
      invokeError: invokeError?.message ?? null,
    },
    { status: 202 },
  );
}
