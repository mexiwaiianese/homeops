import { ACH_LINE, HOME_DESCRIPTION, ORGANIZATION_SAME_AS, OVERAGE_LINE, PUBLIC_PACKAGES, SITE_ORIGIN, annualBillCents, packagePriceLine } from "@/lib/public-site";

export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "portonOS",
    url: SITE_ORIGIN,
    logo: `${SITE_ORIGIN}/brand/portonos-mark.png`,
    description: HOME_DESCRIPTION,
    ...(ORGANIZATION_SAME_AS.length >= 3 ? { sameAs: ORGANIZATION_SAME_AS } : {}),
  };
}

export function productLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "portonOS",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: SITE_ORIGIN,
    description: HOME_DESCRIPTION,
    offers: [
      ...PUBLIC_PACKAGES.map((pkg) => ({
        "@type": "Offer",
        name: pkg.name,
        price: String(annualBillCents(pkg, 1) / 100),
        priceCurrency: "USD",
        description: `${packagePriceLine(pkg)}. ${pkg.includedProperties} properties included. ${ACH_LINE} ${OVERAGE_LINE}${pkg.devTime ? ` ${pkg.devTime}` : ""}`,
        url: `${SITE_ORIGIN}/pricing`,
        eligibleQuantity: {
          "@type": "QuantitativeValue",
          value: pkg.includedProperties,
          unitText: "properties included",
        },
      })),
      {
        "@type": "Offer",
        name: "Additional property",
        price: "18",
        priceCurrency: "USD",
        description: OVERAGE_LINE,
        url: `${SITE_ORIGIN}/pricing`,
      },
    ],
  };
}

export function faqLd(items: Array<{ question: string; answer: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}
