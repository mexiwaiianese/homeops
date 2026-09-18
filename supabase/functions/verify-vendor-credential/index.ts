import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
  });
  const { verificationId } = await req.json();
  const { data: job, error } = await userClient
    .from("vendor_credential_verifications")
    .select("*,vendor_credentials(*)")
    .eq("id", verificationId)
    .single();
  if (error || !job)
    return Response.json({ error: "Not authorized" }, { status: 403 });
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  await admin
    .from("vendor_credential_verifications")
    .update({ status: "processing" })
    .eq("id", job.id);
  try {
    const providerUrl = Deno.env.get("CREDENTIAL_VERIFICATION_URL");
    if (!providerUrl)
      throw new Error("CREDENTIAL_VERIFICATION_URL is not configured");
    const response = await fetch(providerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("CREDENTIAL_VERIFICATION_TOKEN") ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        credential: job.vendor_credentials,
        requestId: job.id,
      }),
    });
    if (!response.ok) throw new Error(`Provider returned ${response.status}`);
    const result = await response.json();
    const status =
      result.verified === true
        ? "verified"
        : result.rejected === true
          ? "rejected"
          : "needs_review";
    await admin
      .from("vendor_credential_verifications")
      .update({
        status,
        provider_reference: result.reference ?? null,
        response_summary: result,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    await admin
      .from("vendor_credentials")
      .update({
        verification_status:
          status === "verified"
            ? "verified"
            : status === "rejected"
              ? "rejected"
              : "pending",
        verified_at: status === "verified" ? new Date().toISOString() : null,
      })
      .eq("id", job.credential_id);
    return Response.json({ ok: true, status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Verification failed";
    await admin
      .from("vendor_credential_verifications")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return Response.json({ error: message }, { status: 500 });
  }
});
