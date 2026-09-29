"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  url: string;
  /** Called once every page has been drawn. */
  onReady?: () => void;
  onError?: (message: string) => void;
  hidden?: boolean;
};

/**
 * Draws a PDF onto canvases with pdf.js so the invoice shows in any browser, including ones
 * whose built-in PDF plugin is off or blocked inside an iframe. The file is fetched and rendered
 * once; the parent decides when to reveal it.
 */
export default function PdfSheet({ url, onReady, onError, hidden }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const container = host.current;
    if (!container) return;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const doc = await pdfjs.getDocument({ url }).promise;
        if (cancelled) return;
        container.replaceChildren();
        // Render at a fixed page width; the sheet may be hidden (1px) while this runs, and CSS
        // scales the canvas to the card afterwards.
        const width = 820;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        for (let index = 1; index <= doc.numPages; index += 1) {
          const page = await doc.getPage(index);
          const base = page.getViewport({ scale: 1 });
          const scale = width / base.width;
          const viewport = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = "pdfPage";
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas is not available.");
          await page.render({ canvasContext: context, viewport }).promise;
          if (cancelled) return;
          container.appendChild(canvas);
        }
        setState("ready");
        onReady?.();
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "The PDF could not be rendered.";
        setState("error");
        onError?.(message);
      }
    })();
    return () => { cancelled = true; };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={hidden ? "pdfSheet preload" : "pdfSheet"} aria-busy={state === "loading"}>
      <div ref={host} className="pdfPages" />
      {state === "error" && (
        <p className="vendorAs">The viewer could not draw this PDF. <a href={url} target="_blank" rel="noopener noreferrer">Open the PDF directly</a>.</p>
      )}
    </div>
  );
}
