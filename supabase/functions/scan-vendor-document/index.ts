import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
Deno.serve(async (req) => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let documentId: string | undefined;
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
    });
    ({ documentId } = await req.json());
    const { data: doc, error } = await userClient
      .from("vendor_documents")
      .select("id,storage_bucket,storage_path,mime_type")
      .eq("id", documentId)
      .single();
    if (error || !doc)
      return Response.json({ error: "Not authorized" }, { status: 403 });
    await admin
      .from("vendor_documents")
      .update({ scan_status: "scanning" })
      .eq("id", doc.id);
    const scannerUrl = Deno.env.get("MALWARE_SCANNER_URL");
    const scannerToken = Deno.env.get("MALWARE_SCANNER_TOKEN");
    if (!scannerUrl) throw new Error("MALWARE_SCANNER_URL is not configured");
    const { data: file, error: downloadError } = await admin.storage
      .from(doc.storage_bucket)
      .download(doc.storage_path);
    if (downloadError) throw downloadError;
    const scan = await fetch(scannerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${scannerToken ?? ""}`,
        "Content-Type": doc.mime_type ?? "application/octet-stream",
      },
      body: file,
    });
    if (!scan.ok) throw new Error(`Scanner returned ${scan.status}`);
    const result = await scan.json();
    const clean = result.clean === true || result.status === "clean";
    await admin
      .from("vendor_documents")
      .update({
        scan_status: clean ? "clean" : "infected",
        scan_provider: result.provider ?? "external",
        scan_reference: result.reference ?? null,
        scan_details: result,
        scanned_at: new Date().toISOString(),
      })
      .eq("id", doc.id);
    return Response.json({ ok: true, clean });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed";
    if (documentId) {
      await admin.from("vendor_documents").update({ scan_status: "scan_failed", scan_details: { error: message }, scanned_at: new Date().toISOString() }).eq("id", documentId);
    }
    return Response.json({ error: message }, { status: 500 });
  }
});
