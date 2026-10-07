import { VENDOR_BASE_CENTS, VENDOR_PAYMENTS_ADDON_CENTS } from "@/lib/vendor-plans";

export const SITE_ORIGIN = "https://www.portonos.com";

export const HOME_TITLE = "portonOS - Property Management Software for Small Managers";
export const HOME_DESCRIPTION = "Property management operations software for small portfolios: maintenance, owner reporting, rent, books, and invited vendors in one workspace.";

/** Add only company profiles portonOS actually owns. Empty means structured data omits sameAs. */
export const ORGANIZATION_SAME_AS: string[] = [];

export const FLAT_PRICE_LINE = "One flat price. No per-transaction fees, no onboarding fee, no per-lead charges.";

/** Sits under each tier amount. Screening is not included: it stays the partner's price. */
export const VALUE_ANCHOR = "One flat price. The per-transaction fees and $99 bank setups rivals charge are included here.";

export const ACH_LINE = "Free ACH payment processing on every included property.";

export const PROPERTY_OVERAGE_CENTS = 150;

export const PROPERTY_OVERAGE_YEAR_CENTS = PROPERTY_OVERAGE_CENTS * 12;

export const OVERAGE_LINE = "Each property past the included total is $18 a year. Add one before renewal and that $18 is prorated to the renewal date, including a partial month. Eleven months left is $16.50. About two weeks left is about $0.75. The payment provider's transaction fee is charged in addition.";

export const OVERAGE_SHORT = "$18 a year, prorated to the renewal date if added mid-year, plus the transaction fee.";

export const ANNUAL_BILLING_LINE = "Billed once a year.";

/** Days after the workspace invoice during which that invoice is refunded. */
export const MONEY_BACK_DAYS = 30;

/** Optional reasons on the cancel form. The field can also be left blank. */
export const CANCEL_REASONS = [
  "Too expensive",
  "Didn't fit how we work",
  "Still using spreadsheets",
  "Something else",
] as const;

/** Quoted at the Start buttons and at checkout. The refund is the workspace invoice only. */
export const CANCEL_COMMITMENT_LINE = "Billed once a year. Cancel in the workspace within 30 days of the invoice and we refund it. After that, cancel before the next annual invoice and you are not billed again.";

export const OVERAGE_FRAME = "Need more properties? Add them anytime at a flat rate. No tier upgrades, no surprises.";

export const SCOPE_LINE = "Built for small portfolios, not 10,000-unit enterprises.";

/** Applicant screening is on Operations and Portfolio. The report is a pass-through. */
export const SCREENING_FEATURE = "A credit, criminal, and eviction report for each adult on the application. You make the leasing decision.";

export const SCREENING_COST = "The report is separate from the annual workspace price. Each adult pays the screening partner's price, passed through. You can pay that price yourself, or waive it for one applicant.";

export const SCREENING_WHERE = "Applicant screening is on Operations and Portfolio.";

export const SCREENING_PUBLISHED_AS_OF = "October 2026";

/** Generic name for the card and ACH processor behind pay links, checkout, and payouts. */
export const PAYMENT_PROCESSOR = "the payment processor";
export const PAYMENT_PROCESSOR_TITLE = "The payment processor";
export const PROCESSOR_RATE = "2.9% + $0.30";
export const PROCESSOR_RATE_AS_OF = "September 29, 2026";
export const PROCESSOR_RATE_LINE = `Card processing is ${PAYMENT_PROCESSOR}'s rate, ${PROCESSOR_RATE}, passed through.`;
export const PROCESSOR_RATE_NOTE = `Processing rates are accurate as of ${PROCESSOR_RATE_AS_OF} and can change.`;

export const SCREENING_PUBLISHED: Array<{ product: string; report: string; price: string }> = [
  {
    product: "portonOS",
    report: "Credit, criminal, and eviction. One charge per adult.",
    price: "The screening partner's price, passed through. You can pay it, or waive it.",
  },
  {
    product: "Buildium",
    report: "Credit, criminal, and eviction. Enhanced adds criteria recommendations on Growth and Premium.",
    price: "$17 when the manager pays. $35 when the applicant pays. Enhanced is $20.",
  },
  {
    product: "DoorLoop",
    report: "TransUnion credit, criminal, and eviction.",
    price: "$45 on Starter, $35 on Pro, $25 on Premium. Or $49.90 on the comprehensive plan, paid by the applicant.",
  },
  {
    product: "TurboTenant",
    report: "Credit, criminal, and eviction.",
    price: "$45 on paid plans, $55 on the free plan. Usually paid by the applicant.",
  },
  {
    product: "RentSpree",
    report: "Resident score and background. Income verification is a separate report.",
    price: "$39.99, or $49.99 with income verification. Usually paid by the applicant.",
  },
];

export const SPREADSHEET_LINE = "Stop running your portfolio through email threads and spreadsheets — dispatch, approve, and record it all in one place.";

export type PublicPackage = {
  id: "core" | "operations" | "portfolio";
  name: string;
  listCents: number;
  introCents?: number;
  introMonths?: number;
  popular?: boolean;
  includedProperties: number;
  who: string;
  summary: string;
  includes: string[];
  devTime?: string;
};

export const PUBLIC_PACKAGES: PublicPackage[] = [
  {
    id: "core",
    name: "Core",
    listCents: 9900,
    introCents: 2500,
    introMonths: 3,
    includedProperties: 25,
    who: "For a desk running homes, owners, and invited vendors.",
    summary: "Operations desk, owner portal, and vendor desk.",
    includes: [
      "25 properties included",
      "Free ACH on included properties",
      "Operations desk: homes, owners, tenants, and maintenance",
      "Owner portal: the work, the cost, and the approval",
      "Vendor desk for invited bids and awarded jobs",
      "Spreadsheet import: homes, tenants, history, and the vendors in that history",
    ],
  },
  {
    id: "operations",
    name: "Operations",
    listCents: 14900,
    popular: true,
    includedProperties: 75,
    who: "For the desk that also lists homes, takes applications, and collects rent.",
    summary: "Core, plus listings, applications, rent collection, and your approved vendor network.",
    includes: [
      "75 properties included",
      "Free ACH on included properties",
      "Everything in Core",
      "Rental listings and ILS feeds",
      "Rental applications",
      "Applicant screening, billed per adult at the partner's price",
      "Rent charges and pay links",
      "Approved vendor list, eligibility, and invited bids",
    ],
    devTime: "Includes ongoing development time for automations.",
  },
  {
    id: "portfolio",
    name: "Portfolio",
    listCents: 29900,
    includedProperties: 250,
    who: "For the desk that also keeps the books and a tenant portal.",
    summary: "The full desk: books and the tenant portal on top of Operations.",
    includes: [
      "250 properties included",
      "Free ACH on included properties",
      "Everything in Operations",
      "Books: property operating history and owner reports",
      "Tenant portal for rent and requests",
    ],
    devTime: "Includes ongoing development time for personalization and new feature creation.",
  },
];

export const VENDOR_PUBLIC_OFFER = {
  href: "/vendors/signup",
  baseCents: VENDOR_BASE_CENTS,
  paymentsAddonCents: VENDOR_PAYMENTS_ADDON_CENTS,
  note: "Only invited vendors from a vetted list can join.",
};

export function publicPackageById(id: string | null | undefined) {
  return PUBLIC_PACKAGES.find((row) => row.id === id) || null;
}

export function dollars(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

/** The invoice for one year. Core's first year is 3 months at the intro rate and 9 months at the list rate. */
export function annualBillCents(pkg: PublicPackage, year: 1 | 2 = 1) {
  if (year === 1 && pkg.introCents && pkg.introMonths) {
    const intro = Math.min(12, pkg.introMonths);
    return pkg.introCents * intro + pkg.listCents * (12 - intro);
  }
  return pkg.listCents * 12;
}

export function yearlyCostCents(pkg: PublicPackage, year: 1 | 2 = 1) {
  return annualBillCents(pkg, year);
}

export function packageRateLine(pkg: PublicPackage) {
  if (pkg.introCents && pkg.introMonths) {
    const rest = 12 - Math.min(12, pkg.introMonths);
    return `${pkg.introMonths} months at ${dollars(pkg.introCents)} and ${rest} months at ${dollars(pkg.listCents)}`;
  }
  return `${dollars(pkg.listCents)}/mo`;
}

export function packagePriceLine(pkg: PublicPackage) {
  const firstYear = dollars(annualBillCents(pkg, 1));
  if (pkg.introCents && pkg.introMonths) {
    return `${firstYear} the first year (${packageRateLine(pkg)}), then ${dollars(annualBillCents(pkg, 2))} a year, billed annually`;
  }
  return `${firstYear} a year (${dollars(pkg.listCents)}/mo), billed annually`;
}

export const FAQ: Array<{ question: string; answer: string }> = [
  {
    question: "How long does setup take?",
    answer: "You confirm a work email and open an empty workspace: your homes, your owners, your vendors. No sample portfolio is copied in. The demo is that same desk with sample homes, so you are not learning a second system after you start. There is no sales call.",
  },
  {
    question: "What does it cost?",
    answer: `Core is ${packagePriceLine(PUBLIC_PACKAGES[0])} and includes ${PUBLIC_PACKAGES[0].includedProperties} properties. Operations is ${packagePriceLine(PUBLIC_PACKAGES[1])} and includes ${PUBLIC_PACKAGES[1].includedProperties} properties. Portfolio is ${packagePriceLine(PUBLIC_PACKAGES[2])} and includes ${PUBLIC_PACKAGES[2].includedProperties} properties. ${ACH_LINE} ${OVERAGE_FRAME} ${OVERAGE_LINE} ${FLAT_PRICE_LINE} ${SCREENING_WHERE} ${SCREENING_COST}`,
  },
  {
    question: "How much is applicant screening?",
    answer: `${SCREENING_WHERE} ${SCREENING_FEATURE} ${SCREENING_COST} Published prices elsewhere, as of ${SCREENING_PUBLISHED_AS_OF}: Buildium $17 when the manager pays or $35 when the applicant pays; DoorLoop $25 to $45 by plan, or $49.90 on its comprehensive applicant plan; TurboTenant $45 or $55; RentSpree $39.99, or $49.99 with income verification. Check those companies before you decide. Their prices can change.`,
  },
  {
    question: "Is my data private?",
    answer: "Your workspace is for your company. Vendor credentials never sit on a public page. We store the work email you give us and the records you put in the workspace so the desk can run. We do not sell that data.",
  },
  {
    question: "How do vendors get paid or invited?",
    answer: `You invite vendors you already trust. ${VENDOR_PUBLIC_OFFER.note} They bid from a private link and run awarded work from a vendor desk. They do not pay to look eligible. The vendor desk is ${dollars(VENDOR_PUBLIC_OFFER.baseCents)} a month. Online payments on invoices add ${dollars(VENDOR_PUBLIC_OFFER.paymentsAddonCents)} a month. ${PROCESSOR_RATE_LINE} ${PROCESSOR_RATE_NOTE} You still pay the vendor for the job. portonOS keeps the bid, the visit, and the invoice on the work order.`,
  },
  {
    question: "Can I cancel?",
    answer: "Yes. Open Billing in the workspace and cancel there. You can leave a reason if you want. Within 30 days of an invoice we refund that invoice. After 30 days, cancel before the next annual invoice and you are not billed again. There is no onboarding fee. Applicant screening and card processing are the partner's charges, passed through, and are not part of the refund.",
  },
  {
    question: "Who is this not for?",
    answer: "Built for small portfolios, not 10,000-unit enterprises. It is not a public marketplace and not a pay-per-lead board.",
  },
];

/**
 * Public name, a photo file in this repo, and a real LinkedIn URL.
 * Leave null until all three exist. Do not invent them.
 */
export const founderIdentity: {
  name: string;
  photoSrc: string;
  profileUrl: string;
} | null = null;

export type FounderPart =
  | { kind: "text"; text: string }
  | { kind: "tire"; text: string; src: string; alt: string; width: number; height: number };

/** First person, in the operator's own words. */
export const founderStory: FounderPart[] = [
  {
    kind: "text",
    text: "On one of my earliest jobs I was installing a rain gutter system on a two story home out in the country and that home changed the way I thought about my work. The client was nice, but their roof was not. The job took twice as long as it should have. I was frustrated as I left the last day and started home.",
  },
  {
    kind: "tire",
    text: "Halfway back to civilization, still in the country, my tire went flat and before I knew it had become so shredded that my work van wouldn't even move. Not only did I not make the money I should have on the job, but now I was about to fork out twice as much as I earned just to fix my van.",
    src: "/about/shredded-tire.jpg",
    alt: "Shredded tire peeled off the wheel of a work van, still sitting in the wheel well",
    width: 768,
    height: 1024,
  },
  {
    kind: "text",
    text: "As a handyman you get used to everything being different every day. It is one of the perks and challenges of that line of work. Just repairing the tire and wheel felt straightforward, but then I saw the invoice. It wasn't so much the cost, but all the different \"nickels and dimes\" they were requiring of me to pay. I was torn up because of the job, because of the work van, and now because of the invoice. I vowed to never \"nickel and dime\" my clients. That was in 2019.",
  },
  {
    kind: "text",
    text: "Fast forward to 2026. Getting passed off from one property manager to the next, I had to change my processes and started looking for a solution that would help simplify my work. Every client's process was different, and I just needed a simple way to send invoices and to report and track the work and NOT get nickled and dimed to death. I needed a platform that could offer top tier USEFULNESS at a predictable cost.",
  },
  {
    kind: "text",
    text: "I was tired of fighting for my social and classifieds ad spend to be heard above the noise, and of being lined up against nameless competitors who were willing to do it cheaper. I wanted a way to work with property owners and managers who value trust over the lowest price.",
  },
  {
    kind: "text",
    text: "Those managers want the same thing, and they also need to handle maintenance requests, find vendors they trust, review applicants, collect rent, and send owners reports that are on time, complete, and beautiful. Large property-management software companies leave smaller portfolio managers with the scraps.",
  },
  {
    kind: "text",
    text: "I was using a payment system, an invoicing system, a job tracker, a marketing system, and a couple of spreadsheets. I built what I needed instead. Other people in that spot will probably want it too.",
  },
];

export const founderSign = "- Nate, portonOS Founder";

/** Changelog byline. A face photo and a LinkedIn URL are still missing. */
export const founderByline = "Nate";

export type CustomerStory = {
  quote: string;
  name: string;
  role: string;
  portfolioSize: string;
  photoSrc: string;
  outcome: string;
};

/** Real customers only. An empty list renders nothing. */
export const customerStories: CustomerStory[] = [];

/** Real counts and logos only. Null renders nothing. */
export const quantityProof: {
  workspaces: number;
  homes: number;
  logos: Array<{ name: string; src: string }>;
} | null = null;

export type ThirdPartyMention = {
  date: string;
  source: string;
  url: string;
  label: string;
};

/** A real review profile or community mention, with the date it appeared. Empty renders nothing. */
export const thirdPartyMentions: ThirdPartyMention[] = [];

export const CHANGELOG: Array<{ date: string; title: string; body: string }> = [
  {
    date: "2026-10-02",
    title: "Crew invoice status",
    body: "A vendor can record when a client invoice was sent, from the crew side of the job.",
  },
  {
    date: "2026-10-01",
    title: "Packages and a private demo link",
    body: "Core, Operations, and Portfolio are the workspace packages. The demo email is a one-person link into a seeded workspace, not a shared password. The link expires in 7 days.",
  },
  {
    date: "2026-09-30",
    title: "Vendor catalog intake",
    body: "A manager can review a vendor from the catalog before that vendor is on the approved list.",
  },
  {
    date: "2026-09-29",
    title: "Rental applications",
    body: "Applications sit on the desk with the listing, instead of in a separate inbox.",
  },
  {
    date: "2026-09-28",
    title: "Vendor desk signup",
    body: "Invited vendors from the vetted list can open their own desk for jobs, crew time, and invoices.",
  },
  {
    date: "2026-09-26",
    title: "Owner portal and tenant portal",
    body: "Owners see cash, work, and approvals without living in the inbox. Tenants get a passwordless link for rent and requests.",
  },
  {
    date: "2026-09-21",
    title: "Listings, rent, books, and invited bids",
    body: "Draft a listing and syndicate it. Post rent charges. Keep property books. Open an invited bid to vendors already on your list.",
  },
  {
    date: "2026-08-30",
    title: "Approved vendor list",
    body: "The vendor list belongs to the management company. Credentials stay off any public page.",
  },
];

export type ComparisonPage = {
  slug: string;
  title: string;
  description: string;
  h1: string;
  lede: string;
  columns: [string, string];
  rows: Array<{ label: string; ours: string; theirs: string }>;
  faq: Array<{ question: string; answer: string }>;
};

const coreLine = packagePriceLine(PUBLIC_PACKAGES[0]);
const operationsLine = packagePriceLine(PUBLIC_PACKAGES[1]);
const portfolioLine = packagePriceLine(PUBLIC_PACKAGES[2]);

const LEARNING_FAQ = {
  question: "How hard is it to learn?",
  answer: "You confirm a work email and open an empty workspace: your homes, your owners, your vendors. The demo is that same desk with sample homes, so you are not learning a second product after you start. There is no sales call.",
};

const ADOPTION_FAQ = {
  question: "What if we switch and the team does not use it?",
  answer: "The desk is where the work already goes: dispatch, approvals, and the record, instead of email threads and spreadsheets. If it does not fit, cancel in the workspace within 30 days of the invoice and we refund it. After that, cancel before the next annual invoice and you are not billed again. There is no onboarding fee.",
};

export const COMPARISONS: ComparisonPage[] = [
  {
    slug: "portonos-vs-angi",
    title: "portonOS vs Angi for Property Managers",
    description: "portonOS is a private vendor list for your company. Angi and Thumbtack sell pay-per-lead access. Vendors on portonOS do not pay to look eligible.",
    h1: "portonOS vs pay-per-lead boards",
    lede: "Angi and Thumbtack sell leads. portonOS is the desk you use with the vendors you already trust. This page does not quote a lead price, because those prices change by job and market and we have not published a verified number.",
    columns: ["portonOS", "Angi, Thumbtack, and similar boards"],
    rows: [
      {
        label: "Who pays",
        ours: `The manager pays a flat annual workspace. Core is ${coreLine}. Operations is ${operationsLine}. Portfolio is ${portfolioLine}.`,
        theirs: "The vendor pays to receive a lead or to look eligible for one.",
      },
      {
        label: "How work shows up",
        ours: "You invite vendors already on your list. They bid from a private link.",
        theirs: "A homeowner posts a job. Many vendors compete for that lead.",
      },
      {
        label: "Properties",
        ours: "Core includes 25 properties, Operations 75, and Portfolio 250. Each property past that is $18 a year, prorated to the renewal date if added mid-year. No tier upgrade is required.",
        theirs: "Not property-management software. No property count.",
      },
      {
        label: "Credentials",
        ours: "Credentials never sit on a public page.",
        theirs: "The vendor's profile is the ad.",
      },
    ],
    faq: [
      {
        question: "Do vendors pay for leads on portonOS?",
        answer: "No. Vendors do not pay to look eligible. You invite them. They bid on jobs you send.",
      },
      {
        question: "Is portonOS a marketplace?",
        answer: "No. It is a workspace for your company, sold to your team, not a public board of leads.",
      },
      LEARNING_FAQ,
      ADOPTION_FAQ,
      {
        question: "How do the fees compare?",
        answer: "On a lead board the vendor pays to receive a lead or to look eligible. On portonOS the manager pays one flat annual workspace. Vendors do not pay to look eligible. This page does not quote a lead price, because those prices change by job and market and we have not published a verified number.",
      },
    ],
  },
  {
    slug: "portonos-vs-buildium",
    title: "portonOS vs Buildium for Property Managers",
    description: "Compare portonOS with Buildium on annual price, included properties, transaction fees, applicant screening, and private vendor workflows.",
    h1: "portonOS vs Buildium",
    lede: "Buildium is the long-running property-management suite (founded in 2004, now RealPage). Its public pricing starts lower on the Essential tier and then adds fees. portonOS is a flat annual workspace. Buildium's numbers below are the public starting prices as of October 2026. Check Buildium before you decide. They can change.",
    columns: ["portonOS", "Buildium"],
    rows: [
      {
        label: "Published price",
        ours: `Core ${coreLine}, 25 properties. Operations ${operationsLine}, 75 properties. Portfolio ${portfolioLine}, 250 properties. Each property past that is $18 a year, prorated to the renewal date if added mid-year.`,
        theirs: "Essential starting at $62/month. Growth starting at $192/month. Premium starting at $400/month.",
      },
      {
        label: "Extra fees",
        ours: `${FLAT_PRICE_LINE} ${ACH_LINE} ${OVERAGE_LINE}`,
        theirs: "Published add-ons include per-transaction EFT fees and a $99 bank setup.",
      },
      {
        label: "Applicant screening",
        ours: `${SCREENING_WHERE} ${SCREENING_FEATURE} ${SCREENING_COST}`,
        theirs: "Published at $17 per screen when the manager pays, $35 when the applicant pays, and $20 for Enhanced Tenant Screening on Growth and Premium. As of October 2026.",
      },
      {
        label: "Vendor work",
        ours: "Your approved list. Invited bids. Vendors do not pay to look eligible.",
        theirs: "A property-management suite. Not a private invited-vendor desk.",
      },
      {
        label: "Billing period",
        ours: "Once a year. Cancel before the next annual invoice. No onboarding fee.",
        theirs: "Monthly starting prices, with the add-on fees above in the fine print.",
      },
    ],
    faq: [
      {
        question: "Does portonOS charge per-transaction fees?",
        answer: "No. The workspace price is flat. No per-transaction fee, no onboarding fee, and no per-lead charge. Card processing on a vendor invoice is the payment processor's rate, passed through, and only if that vendor turns payments on. Processing rates are accurate as of September 29, 2026 and can change. Applicant screening is the screening partner's price, passed through, per adult.",
      },
      {
        question: "What does Core cost?",
        answer: `Core is ${coreLine} and includes 25 properties, plus the operations desk, the owner portal, and the vendor desk. ACH is free on those properties. Past 25, each added property is $18 a year, prorated to the renewal date if you add it mid-year. The payment provider's transaction fee is charged in addition.`,
      },
      LEARNING_FAQ,
      ADOPTION_FAQ,
      {
        question: "How do the fees compare?",
        answer: "Buildium's public starting prices are Essential at $62/month, Growth at $192/month, and Premium at $400/month, plus published add-ons: per-transaction EFT fees and a $99 bank setup. portonOS is one flat annual price. No per-transaction fee, no onboarding fee, and no per-lead charge. Applicant screening is still the screening partner's price, per adult, on Operations and Portfolio. Check Buildium before you decide. Their prices can change. As of October 2026.",
      },
    ],
  },
  {
    slug: "portonos-vs-doorloop",
    title: "portonOS vs DoorLoop for Property Managers",
    description: "Compare portonOS with DoorLoop on annual price, property limits, onboarding fees, applicant screening, and private vendor workflows.",
    h1: "portonOS vs DoorLoop",
    lede: "DoorLoop is all-in-one property management software for small and mid-size operators. Its Starter tier matches portonOS Core's $99 entry price, then bills yearly and caps units. DoorLoop's numbers below are the public pricing as of October 2026. Check DoorLoop before you decide.",
    columns: ["portonOS", "DoorLoop"],
    rows: [
      {
        label: "Entry price",
        ours: `Core is ${coreLine}. Operations is ${operationsLine}. Portfolio is ${portfolioLine}.`,
        theirs: "Starter is $99/mo, shown as $69/mo when billed yearly.",
      },
      {
        label: "Properties",
        ours: "Core includes 25, Operations 75, and Portfolio 250. Each property past that is $18 a year, prorated to the renewal date if added mid-year. No tier upgrade is required.",
        theirs: "Starter is capped at 10 units.",
      },
      {
        label: "When you pay",
        ours: "Once a year. Core's first year is 3 months at $25 and 9 months at $99. No onboarding fee.",
        theirs: "Billed yearly, with an onboarding fee.",
      },
      {
        label: "Vendor work",
        ours: "Private list. Invited bids. Credentials never sit on a public page.",
        theirs: "Property operations platform. Not a private invited-vendor network.",
      },
      {
        label: "Applicant screening",
        ours: `${SCREENING_WHERE} ${SCREENING_FEATURE} ${SCREENING_COST}`,
        theirs: "TransUnion credit, criminal, and eviction. Published at $45 per screen on Starter, $35 on Pro, and $25 on Premium. The comprehensive plan charges the applicant $49.90. As of October 2026.",
      },
    ],
    faq: [
      {
        question: "Does portonOS bill yearly?",
        answer: "Yes. Every workspace package is billed once a year. Core's first year is 3 months at $25 and 9 months at $99 ($966). After that, Core is $1,188 a year. Operations is $1,788 a year. Portfolio is $3,588 a year. Cancel in the workspace within 30 days of an invoice and we refund that invoice. After 30 days, cancel before the next annual invoice and you are not billed again.",
      },
      {
        question: "What happens past the included properties?",
        answer: "You keep the same plan. Each property past the included total is $18 a year. Add one before renewal and that $18 is prorated to the renewal date, including a partial month. Eleven months left is $16.50. About two weeks left is about $0.75. The payment provider's transaction fee is charged in addition. Core includes 25, Operations 75, and Portfolio 250. There is no forced upgrade.",
      },
      LEARNING_FAQ,
      ADOPTION_FAQ,
      {
        question: "How do the fees compare?",
        answer: "DoorLoop Starter is $99/mo, shown as $69/mo when billed yearly, capped at 10 units, and billed with an onboarding fee. portonOS Core is $966 the first year, then $1,188 a year, with 25 properties included. Each property past that is $18 a year, prorated to the renewal date. No onboarding fee. Check DoorLoop before you decide. As of October 2026.",
      },
    ],
  },
];

export function comparisonBySlug(slug: string) {
  return COMPARISONS.find((row) => row.slug === slug) || null;
}

export const CATEGORY_PATH = "/property-management-software";

export const INDEXABLE_PATHS = [
  "/",
  "/pricing",
  "/about",
  "/changelog",
  "/terms",
  "/resources",
  CATEGORY_PATH,
  "/register",
  "/vendors/signup",
  ...COMPARISONS.map((row) => `/vs/${row.slug}`),
];
