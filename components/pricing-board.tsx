import {
  ACH_LINE,
  ANNUAL_BILLING_LINE,
  FLAT_PRICE_LINE,
  OVERAGE_FRAME,
  OVERAGE_LINE,
  PUBLIC_PACKAGES,
  SCREENING_COST,
  SCREENING_FEATURE,
  SCREENING_PUBLISHED,
  SCREENING_PUBLISHED_AS_OF,
  SCREENING_WHERE,
  VENDOR_PUBLIC_OFFER,
  annualBillCents,
  dollars,
  packageRateLine,
  type PublicPackage,
} from "@/lib/public-site";

const ROWS: Array<{ label: string; cell: (pkg: PublicPackage) => string }> = [
  { label: "Annual bill", cell: (pkg) => (pkg.introCents ? `${dollars(annualBillCents(pkg, 1))} the first year` : `${dollars(annualBillCents(pkg, 1))} a year`) },
  { label: "How the year is priced", cell: (pkg) => packageRateLine(pkg) },
  { label: "After the first year", cell: (pkg) => (pkg.introCents ? `${dollars(annualBillCents(pkg, 2))} a year` : "Same annual bill") },
  { label: "Billing", cell: () => ANNUAL_BILLING_LINE },
  { label: "Properties included", cell: (pkg) => String(pkg.includedProperties) },
  { label: "Additional properties", cell: () => "$18/year, prorated to renewal if added mid-year" },
  { label: "ACH on included properties", cell: () => "Free" },
  { label: "Operations desk", cell: () => "Included" },
  { label: "Owner portal", cell: () => "Included" },
  { label: "Vendor desk", cell: () => "Included" },
  { label: "Listings, applications, rent", cell: (pkg) => (pkg.id === "core" ? "—" : "Included") },
  { label: "Applicant screening", cell: (pkg) => (pkg.id === "core" ? "—" : "Partner's price per adult") },
  { label: "Approved vendor network", cell: (pkg) => (pkg.id === "core" ? "—" : "Included") },
  { label: "Books and tenant portal", cell: (pkg) => (pkg.id === "portfolio" ? "Included" : "—") },
  {
    label: "Ongoing development time",
    cell: (pkg) => (pkg.id === "operations" ? "Automations" : pkg.id === "portfolio" ? "Personalization and new features" : "—"),
  },
];

export default function PricingBoard() {
  return (
    <div className="pricingBoard">
      <p className="summary">{ANNUAL_BILLING_LINE} Cancel before the next annual invoice and you are not billed again.</p>
      <div className="pricingGrid">
        {PUBLIC_PACKAGES.map((pkg) => (
          <article key={pkg.id} className={pkg.popular ? "pricingCard popular" : "pricingCard"}>
            {pkg.popular && <span className="popularBadge">Most popular</span>}
            <h2>{pkg.name}</h2>
            <p className="pricingAmount">
              <span>{dollars(pkg.introCents ?? pkg.listCents)}/mo</span>
              <span className="pricingIncluded">{pkg.includedProperties} properties included</span>
            </p>
            <p className="summary">
              {pkg.introCents && pkg.introMonths
                ? `For ${pkg.introMonths} months, then ${dollars(pkg.listCents)}/mo. ${dollars(annualBillCents(pkg, 1))} the first year, then ${dollars(annualBillCents(pkg, 2))} a year. ${ANNUAL_BILLING_LINE}`
                : `${dollars(annualBillCents(pkg, 1))} a year. ${ANNUAL_BILLING_LINE}`}
            </p>
            <p>{pkg.summary}</p>
            <ul className="planList">
              {pkg.includes.map((item) => <li key={item}>{item}</li>)}
            </ul>
            {pkg.devTime && <p>{pkg.devTime}</p>}
            <a className="primary" href={`/register?package=${pkg.id}`}>Start {pkg.name}</a>
          </article>
        ))}
      </div>
      <p className="pricingFlat">{FLAT_PRICE_LINE} {ACH_LINE}</p>
      <p className="pricingFlat">{OVERAGE_LINE}</p>
      <p>{OVERAGE_FRAME}</p>
      <div className="pricingTableWrap">
        <table className="pricingTable">
          <caption>What each package includes</caption>
          <thead>
            <tr>
              <th scope="col"> </th>
              {PUBLIC_PACKAGES.map((pkg) => <th key={pkg.id} scope="col">{pkg.name}{pkg.popular ? " · Most popular" : ""}</th>)}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {PUBLIC_PACKAGES.map((pkg) => <td key={pkg.id}>{row.cell(pkg)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="pricingVendor">
        <h2>Applicant screening</h2>
        <p>{SCREENING_WHERE} {SCREENING_FEATURE} {SCREENING_COST}</p>
        <div className="pricingTableWrap">
          <table className="pricingTable">
            <caption>Published screening prices as of {SCREENING_PUBLISHED_AS_OF}</caption>
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Report</th>
                <th scope="col">Price</th>
              </tr>
            </thead>
            <tbody>
              {SCREENING_PUBLISHED.map((row) => (
                <tr key={row.product}>
                  <th scope="row">{row.product}</th>
                  <td>{row.report}</td>
                  <td>{row.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="summary">Competitor prices are the rates those companies publish. Check them before you decide. They can change.</p>
      </section>
      <section className="pricingVendor">
        <h2>For vendors</h2>
        <p>
          {VENDOR_PUBLIC_OFFER.note} The vendor desk is {dollars(VENDOR_PUBLIC_OFFER.baseCents)} a month.
          Online payments on invoices add {dollars(VENDOR_PUBLIC_OFFER.paymentsAddonCents)} a month.
          Card processing is Stripe&apos;s rate, 2.9% + $0.30, passed through. Vendors do not pay to look eligible.
        </p>
        <a href={VENDOR_PUBLIC_OFFER.href}>Vendor signup</a>
      </section>
    </div>
  );
}
