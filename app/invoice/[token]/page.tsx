"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import BrandLockup from "@/components/brand-lockup";
import PdfSheet from "@/components/pdf-sheet";
import { INVOICE_AD_DEFAULTS, presentInvoiceAd, type InvoiceAd, type InvoiceAdAudience } from "@/lib/invoice-ads";

function InvoiceAdCopy({ ad }: { ad: InvoiceAd }) {
  const shown = presentInvoiceAd(ad);
  return (
    <>
      {shown.eyebrow && <p className="eyebrow">{shown.eyebrow}</p>}
      <h1>{shown.headline}</h1>
      {shown.imageUrl && <img className="invoiceAdImage" src={shown.imageUrl} alt={shown.imageAlt || ""} />}
      <div className="invoiceAdBody" dangerouslySetInnerHTML={{ __html: shown.html }} />
      {shown.ctaLabel && shown.ctaUrl && <a className="invoiceAdMore" href={shown.ctaUrl}>{shown.ctaLabel} →</a>}
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
