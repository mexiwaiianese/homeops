/**
 * The note shown on /invoice/[token] while the PDF renders. Two versions: one for the property
 * manager who opens the email, one for the vendor who opens their own invoice. Editable from
 * /admin/invoice-ads. Images are stored inline as data URLs so no storage bucket is needed.
 */

export type InvoiceAdAudience = "manager" | "vendor";

export type InvoiceAd = {
  audience: InvoiceAdAudience;
  eyebrow: string;
  headline: string;
  /** Sanitized HTML. Allowed: p, ul, ol, li, strong, em, b, i, br, a, h2, h3, span, img. */
  html: string;
  imageUrl: string | null;
  imageAlt: string;
  ctaLabel: string;
  ctaUrl: string;
  updatedAt: string;
};

export const INVOICE_AD_IMAGE_MAX_BYTES = 1_500_000;

export const INVOICE_AD_DEFAULTS: Record<InvoiceAdAudience, InvoiceAd> = {
  manager: {
    audience: "manager",
    eyebrow: "FOR PROPERTY MANAGERS",
    headline: "The repair, the vendor, and the owner numbers in one place.",
    html: [
      "<ul>",
      "<li>Tenant requests open on the property, with the person who reported them.</li>",
      "<li>Send the job to vendors who do that work and compare their bids.</li>",
      "<li>Crew arrival, photos, and departure stay on the visit.</li>",
      "<li>Open work shows as an expected expense on the property and on the owner statement before the bill posts.</li>",
      "</ul>",
    ].join(""),
    imageUrl: null,
    imageAlt: "",
    ctaLabel: "See the manager desk",
    ctaUrl: "/property-managers",
    updatedAt: "2026-09-28T00:00:00.000Z",
  },
  vendor: {
    audience: "vendor",
    eyebrow: "YOUR INVOICE",
    headline: "This is the invoice you sent.",
    html: [
      "<p>You opened it from your desk, so this note is for you. The property manager who gets the email sees a different note about running their properties on HomeOps, then the same invoice.</p>",
      "<ul>",
      "<li>Jobs, crew arrival and departure, and this invoice stay on your desk.</li>",
      "<li>Email invoices are included. Online card payment is the add-on.</li>",
      "</ul>",
    ].join(""),
    imageUrl: null,
    imageAlt: "",
    ctaLabel: "",
    ctaUrl: "",
    updatedAt: "2026-09-28T00:00:00.000Z",
  },
};

export function isInvoiceAdAudience(value: unknown): value is InvoiceAdAudience {
  return value === "manager" || value === "vendor";
}

const ALLOWED_TAGS = new Set(["p", "ul", "ol", "li", "strong", "em", "b", "i", "br", "a", "h2", "h3", "span", "img", "small"]);
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height"]),
  span: new Set(["class"]),
  p: new Set(["class"]),
};

function safeUrl(value: string, allowData: boolean) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("#") || /^mailto:/i.test(trimmed)) return trimmed;
  if (allowData && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(trimmed)) return trimmed;
  return null;
}

/**
 * Small allowlist sanitizer for operator-entered markup. Drops scripts, styles, event handlers,
 * and javascript: URLs. Not a general-purpose HTML parser; it only needs to hold simple ad copy.
 */
export function sanitizeInvoiceAdHtml(input: string) {
  let html = String(input || "").slice(0, 20_000);
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  html = html.replace(/<(script|style|iframe|object|embed|form|svg|math|link|meta)\b[\s\S]*?<\/\1\s*>/gi, "");
  html = html.replace(/<(script|style|iframe|object|embed|form|svg|math|link|meta)\b[^>]*\/?>/gi, "");
  return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_match, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    if (_match.startsWith("</")) return `</${tag}>`;
    const allowed = ALLOWED_ATTRS[tag];
    const attrs: string[] = [];
    if (allowed) {
      const attrPattern = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
      let found: RegExpExecArray | null;
      while ((found = attrPattern.exec(rawAttrs))) {
        const name = found[1].toLowerCase();
        if (!allowed.has(name)) continue;
        const value = (found[3] ?? found[4] ?? found[5] ?? "").replace(/"/g, "&quot;");
        if (name === "href" || name === "src") {
          const url = safeUrl(value.replace(/&quot;/g, ""), name === "src");
          if (!url) continue;
          attrs.push(`${name}="${url.replace(/"/g, "&quot;")}"`);
          continue;
        }
        if (name === "target" && value !== "_blank") continue;
        attrs.push(`${name}="${value}"`);
      }
      if (tag === "a" && attrs.some((attr) => attr.startsWith('target="_blank"'))) attrs.push('rel="noopener noreferrer"');
    }
    const selfClose = tag === "br" || tag === "img" ? " /" : "";
    return `<${tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}${selfClose}>`;
  });
}

export function normalizeInvoiceAd(audience: InvoiceAdAudience, input: Partial<InvoiceAd>): InvoiceAd | { error: string } {
  const base = INVOICE_AD_DEFAULTS[audience];
  const headline = String(input.headline ?? base.headline).trim().slice(0, 160);
  if (!headline) return { error: "Enter a headline." };
  const image = input.imageUrl == null || input.imageUrl === "" ? null : safeUrl(String(input.imageUrl), true);
  if (input.imageUrl && !image) return { error: "The image must be an uploaded file or an https link." };
  if (image && image.startsWith("data:") && image.length > INVOICE_AD_IMAGE_MAX_BYTES * 1.37) return { error: "Keep the image under 1.5 MB." };
  const ctaUrl = String(input.ctaUrl ?? base.ctaUrl).trim();
  if (ctaUrl && !safeUrl(ctaUrl, false)) return { error: "The button link must start with / or https://." };
  return {
    audience,
    eyebrow: String(input.eyebrow ?? base.eyebrow).trim().slice(0, 60),
    headline,
    html: sanitizeInvoiceAdHtml(String(input.html ?? base.html)),
    imageUrl: image,
    imageAlt: String(input.imageAlt ?? "").trim().slice(0, 160),
    ctaLabel: String(input.ctaLabel ?? base.ctaLabel).trim().slice(0, 60),
    ctaUrl,
    updatedAt: new Date().toISOString(),
  };
}

type Store = Map<InvoiceAdAudience, InvoiceAd>;
const store: Store = ((globalThis as typeof globalThis & { __homeopsInvoiceAds?: Store }).__homeopsInvoiceAds ??= new Map());

export function getDemoInvoiceAd(audience: InvoiceAdAudience) {
  return store.get(audience) || INVOICE_AD_DEFAULTS[audience];
}

export function saveDemoInvoiceAd(ad: InvoiceAd) {
  store.set(ad.audience, ad);
  return ad;
}
