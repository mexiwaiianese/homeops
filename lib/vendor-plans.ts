/** Vendor self-serve plans. No AI features are included on either plan. */

export const VENDOR_BASE_CENTS = 1900;
/** Flat monthly add-on for a pay link on the invoice. Card processing stays Stripe's rate, passed through. */
export const VENDOR_PAYMENTS_ADDON_CENTS = 1000;

export function vendorMonthlyCents(payments: boolean) {
  return VENDOR_BASE_CENTS + (payments ? VENDOR_PAYMENTS_ADDON_CENTS : 0);
}

export type VendorPromo = { code: string; label: string; percentOff: number };

/** Active codes. Percent applies to the $19 base only. The online-payments add-on is always charged. */
const VENDOR_PROMOS: VendorPromo[] = [
  { code: "FOUNDING", label: "Founding vendor", percentOff: 100 },
];

export function lookupVendorPromo(raw: string): VendorPromo | null {
  const code = raw.trim().toUpperCase();
  if (!code) return null;
  return VENDOR_PROMOS.find((row) => row.code === code) || null;
}

export function pricedMonthlyCents(payments: boolean, promo: VendorPromo | null) {
  const addon = payments ? VENDOR_PAYMENTS_ADDON_CENTS : 0;
  if (!promo) return VENDOR_BASE_CENTS + addon;
  const off = Math.min(100, Math.max(0, promo.percentOff));
  const base = Math.max(0, Math.round((VENDOR_BASE_CENTS * (100 - off)) / 100));
  return base + addon;
}

/** Share this link; the code is filled in when the page opens. */
export function vendorSignupPromoUrl(origin: string, code: string) {
  return `${origin.replace(/\/$/, "")}/vendors/signup?code=${encodeURIComponent(code.trim().toUpperCase())}`;
}

export function dollars(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}
