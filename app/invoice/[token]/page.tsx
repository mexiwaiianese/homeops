"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import BrandLockup from "@/components/brand-lockup";
import PdfSheet from "@/components/pdf-sheet";
import { INVOICE_AD_DEFAULTS, type InvoiceAd, type InvoiceAdAudience } from "@/lib/invoice-ads";

function InvoiceAdCopy({ ad }: { ad: InvoiceAd }) {
  return (
    <>
      {ad.eyebrow && <p className="eyebrow">{ad.eyebrow}</p>}
      <h1>{ad.headline}</h1>
      {ad.imageUrl && <img className="invoiceAdImage" src={ad.imageUrl} alt={ad.imageAlt || ""} />}
      <div className="invoiceAdBody" dangerouslySetInnerHTML={{ __html: ad.html }} />
      {ad.ctaLabel && ad.ctaUrl && <a className="invoiceAdMore" href={ad.ctaUrl}>{ad.ctaLabel} →</a>}
    </>
  );
}

function InvoiceView() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const vendorPreview = useSearchParams().get("as") === "vendor";
  const audience: InvoiceAdAudience = vendorPreview ? "vendor" : "manager";
  const [ad, setAd] = useState<InvoiceAd>(INVOICE_AD_DEFAULTS[audience]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState("");
  const [showing, setShowing] = useState(false);
  const pdfUrl = `/api/invoice/${params.token}/pdf`;

  useEffect(() => {
    fetch(`/api/invoice-ads?audience=${audience}`)
      .then((r) => r.json())
      .then((body) => { if (body?.ad) setAd(body.ad); })
      .catch(() => {});
  }, [audience]);

  function back() {
    if (vendorPreview) { router.push("/vendors/invoices"); return; }
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  const canProceed = loaded || Boolean(failed);

  return (
    <main className="intakeShell">
      <section className={showing ? "intakeCard jobCard invoiceSheet" : "intakeCard jobCard invoiceAd"}>
        <BrandLockup artwork="lockup" />
        <PdfSheet url={pdfUrl} hidden={!showing} onReady={() => setLoaded(true)} onError={(message) => setFailed(message)} />
        {!showing && (
          <>
            <InvoiceAdCopy ad={ad} />
            <div className="invoiceAdActions">
              <button type="button" className="secondaryBtn" onClick={back}>Back to invoices</button>
              <button type="button" className="primary" disabled={!canProceed} onClick={() => setShowing(true)}>
                {canProceed ? "Proceed" : "Loading invoice…"}
              </button>
            </div>
            {!canProceed && <div className="invoiceAdTrack indeterminate" aria-hidden="true"><span /></div>}
          </>
        )}
        {showing && (
          <div className="invoiceAdActions">
            <button type="button" className="secondaryBtn" onClick={back}>Back to invoices</button>
            <a className="secondaryBtn" href={pdfUrl} target="_blank" rel="noopener noreferrer">Download PDF</a>
          </div>
        )}
      </section>
    </main>
  );
}

export default function InvoiceViewPage() {
  return (
    <Suspense fallback={<main className="intakeShell"><section className="intakeCard jobCard"><p>Opening the invoice…</p></section></main>}>
      <InvoiceView />
    </Suspense>
  );
}
