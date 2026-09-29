import type { SupabaseClient } from "@supabase/supabase-js";
import { INVOICE_AD_DEFAULTS, type InvoiceAd, type InvoiceAdAudience } from "@/lib/invoice-ads";

function asAd(row: any): InvoiceAd {
  return {
    audience: row.audience,
    eyebrow: row.eyebrow || "",
    headline: row.headline || "",
    html: row.html || "",
    imageUrl: row.image_url || null,
    imageAlt: row.image_alt || "",
    ctaLabel: row.cta_label || "",
    ctaUrl: row.cta_url || "",
    updatedAt: row.updated_at,
  };
}

export async function getLiveInvoiceAd(admin: SupabaseClient, audience: InvoiceAdAudience) {
  const { data, error } = await admin.from("invoice_ads").select("*").eq("audience", audience).maybeSingle();
  // Missing table (migration not run yet) falls back to the built-in copy.
  if (error || !data) return INVOICE_AD_DEFAULTS[audience];
  return asAd(data);
}

export async function saveLiveInvoiceAd(admin: SupabaseClient, ad: InvoiceAd) {
  const { error } = await admin.from("invoice_ads").upsert({
    audience: ad.audience,
    eyebrow: ad.eyebrow,
    headline: ad.headline,
    html: ad.html,
    image_url: ad.imageUrl,
    image_alt: ad.imageAlt,
    cta_label: ad.ctaLabel,
    cta_url: ad.ctaUrl,
    updated_at: ad.updatedAt,
  }, { onConflict: "audience" });
  return error?.message || null;
}
