"use client";

import { ChangeEvent, useEffect, useState } from "react";
import BrandLockup from "@/components/brand-lockup";
import { INVOICE_AD_DEFAULTS, INVOICE_AD_IMAGE_MAX_BYTES, sanitizeInvoiceAdHtml, type InvoiceAd, type InvoiceAdAudience } from "@/lib/invoice-ads";

const AUDIENCES: Array<{ id: InvoiceAdAudience; label: string; hint: string }> = [
  { id: "manager", label: "Property manager", hint: "Shown to whoever opens the invoice link from the email." },
  { id: "vendor", label: "Vendor", hint: "Shown when the vendor opens their own invoice from the desk (?as=vendor)." },
];

export default function InvoiceAdEditor() {
  const [audience, setAudience] = useState<InvoiceAdAudience>("manager");
  const [ads, setAds] = useState<Record<InvoiceAdAudience, InvoiceAd>>(INVOICE_AD_DEFAULTS);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const ad = ads[audience];

  useEffect(() => {
    fetch("/api/invoice-ads").then((r) => r.json()).then((body) => {
      if (body?.ads) setAds(body.ads);
    }).catch(() => setMessage("Could not load the current notes."));
  }, []);

  function patch(changes: Partial<InvoiceAd>) {
    setAds((all) => ({ ...all, [audience]: { ...all[audience], ...changes } }));
  }

  function pickImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) { setMessage("Use a PNG, JPG, GIF, or WebP image."); return; }
    if (file.size > INVOICE_AD_IMAGE_MAX_BYTES) { setMessage("Keep the image under 1.5 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => { patch({ imageUrl: String(reader.result) }); setMessage(""); };
    reader.readAsDataURL(file);
  }

  async function save() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/invoice-ads", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ad),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not save."); return; }
    setAds((all) => ({ ...all, [audience]: body.ad }));
    setMessage(`Saved the ${audience === "manager" ? "property manager" : "vendor"} note.`);
  }

  function reset() {
    setAds((all) => ({ ...all, [audience]: INVOICE_AD_DEFAULTS[audience] }));
    setMessage("Reverted to the built-in copy. Save to keep it.");
  }

  const preview = sanitizeInvoiceAdHtml(ad.html);

  return (
    <section className="intakeCard jobCard" style={{ width: "min(1180px, 100%)" }}>
      <BrandLockup artwork="lockup" />
      <p className="eyebrow">OPERATOR TOOLS</p>
      <h1>Invoice link note.</h1>
      <p>This is what a person sees while the invoice PDF renders. Edit the copy, drop in an image, or write your own markup. Allowed tags: p, ul, ol, li, strong, em, br, a, h2, h3, span, img.</p>
      <div className="adTabs">
        {AUDIENCES.map((row) => (
          <button key={row.id} type="button" className={audience === row.id ? "on" : ""} onClick={() => { setAudience(row.id); setMessage(""); }}>{row.label}</button>
        ))}
      </div>
      <p className="vendorAs">{AUDIENCES.find((row) => row.id === audience)?.hint}</p>
      {message && <div className="notice">{message}</div>}
      <div className="adEditorGrid">
        <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <label>Eyebrow<input value={ad.eyebrow} onChange={(e) => patch({ eyebrow: e.target.value })} placeholder="FOR PROPERTY MANAGERS" /></label>
          <label>Headline<input required value={ad.headline} onChange={(e) => patch({ headline: e.target.value })} /></label>
          <label>
            Image
            <span className="adImageRow">
              {ad.imageUrl && <img src={ad.imageUrl} alt={ad.imageAlt || ""} />}
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={pickImage} />
              {ad.imageUrl && <button type="button" className="secondaryBtn" onClick={() => patch({ imageUrl: null })}>Remove</button>}
            </span>
          </label>
          <label>Image alt text<input value={ad.imageAlt} onChange={(e) => patch({ imageAlt: e.target.value })} placeholder="What the image shows" /></label>
          <label>Body (HTML)<textarea value={ad.html} onChange={(e) => patch({ html: e.target.value })} spellCheck={false} /></label>
          <div className="formGrid">
            <label>Button label<input value={ad.ctaLabel} onChange={(e) => patch({ ctaLabel: e.target.value })} placeholder="See the manager desk" /></label>
            <label>Button link<input value={ad.ctaUrl} onChange={(e) => patch({ ctaUrl: e.target.value })} placeholder="/property-managers" /></label>
          </div>
          <div className="invoiceAdActions">
            <button type="button" className="secondaryBtn" onClick={reset}>Revert to default</button>
            <button type="submit" className="primary" disabled={busy}>{busy ? "Saving…" : "Save note"}</button>
          </div>
          <p className="vendorAs">Last saved {new Date(ad.updatedAt).toLocaleString()}. Scripts, styles, and inline event handlers are removed on save.</p>
        </form>
        <div className="adPreview">
          <p className="vendorAs" style={{ marginBottom: 12 }}>Preview</p>
          {ad.eyebrow && <p className="eyebrow">{ad.eyebrow}</p>}
          <h1>{ad.headline || "Headline"}</h1>
          {ad.imageUrl && <img className="invoiceAdImage" src={ad.imageUrl} alt={ad.imageAlt || ""} />}
          <div className="invoiceAdBody" dangerouslySetInnerHTML={{ __html: preview }} />
          {ad.ctaLabel && ad.ctaUrl && <a className="invoiceAdMore" href={ad.ctaUrl}>{ad.ctaLabel} →</a>}
          <div className="invoiceAdActions">
            <button type="button" className="secondaryBtn" disabled>Back to invoices</button>
            <button type="button" className="primary" disabled>Loading invoice…</button>
          </div>
        </div>
      </div>
    </section>
  );
}
