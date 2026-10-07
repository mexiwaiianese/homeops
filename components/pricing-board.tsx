"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  ACH_LINE,
  ANNUAL_BILLING_LINE,
  CANCEL_COMMITMENT_LINE,
  FLAT_PRICE_LINE,
  OVERAGE_FRAME,
  OVERAGE_LINE,
  PAYMENT_PROCESSOR,
  PROCESSOR_RATE,
  PROCESSOR_RATE_NOTE,
  PUBLIC_PACKAGES,
  SCREENING_COST,
  SCREENING_FEATURE,
  SCREENING_PUBLISHED,
  SCREENING_PUBLISHED_AS_OF,
  SCREENING_WHERE,
  VALUE_ANCHOR,
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
  { label: "Spreadsheet import", cell: () => "Included" },
  { label: "Listings, applications, rent", cell: (pkg) => (pkg.id === "core" ? "—" : "Included") },
  { label: "Applicant screening", cell: (pkg) => (pkg.id === "core" ? "—" : "Partner's price per adult") },
  { label: "Approved vendor network", cell: (pkg) => (pkg.id === "core" ? "—" : "Included") },
  { label: "Books and tenant portal", cell: (pkg) => (pkg.id === "portfolio" ? "Included" : "—") },
  {
    label: "Ongoing development time",
    cell: (pkg) => (pkg.id === "operations" ? "Automations" : pkg.id === "portfolio" ? "Personalization and new features" : "—"),
  },
];

const PREVIEW_ROWS = 4;

function perPropertyMonthly(pkg: PublicPackage) {
  const cents = annualBillCents(pkg, 1) / 12 / pkg.includedProperties;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

export default function PricingBoard() {
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const featureRows = featuresOpen ? ROWS : ROWS.slice(0, PREVIEW_ROWS);
  return (
    <div className="pricingBoard">
      <p className="summary">{CANCEL_COMMITMENT_LINE}</p>
      <div className="pricingGrid">
        {PUBLIC_PACKAGES.map((pkg) => (
          <article key={pkg.id} className={pkg.popular ? "pricingCard popular" : "pricingCard"}>
            <div className="pricingCardBody">
            {pkg.popular && <span className="popularBadge">Most popular</span>}
            <h2>{pkg.name}</h2>
            <p className="pricingWho">{pkg.who}</p>
            <p className="pricingAmount">
              <span>{dollars(pkg.introCents ?? pkg.listCents)}/mo</span>
              <span className="pricingIncluded">{pkg.includedProperties} properties included</span>
            </p>
            <p className="pricingAnchor">{VALUE_ANCHOR} At the included property count, the first-year workspace cost is {perPropertyMonthly(pkg)} per property per month.</p>
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
            </div>
            <a className="primary" href={`/register?package=${pkg.id}`}>Start {pkg.name}</a>
            <p className="marketingTrust">{CANCEL_COMMITMENT_LINE} <a href="/terms">Terms</a>.</p>
          </article>
        ))}
      </div>
      <p className="pricingFlat">{FLAT_PRICE_LINE} {ACH_LINE}</p>
      <p className="pricingFlat">{OVERAGE_LINE}</p>
      <p>{OVERAGE_FRAME}</p>
      <div className={featuresOpen ? "pricingCompare" : "pricingCompare is-collapsed"}>
        <div className="pricingTableWrap">
          <table className="pricingTable">
            <caption>What each package includes</caption>
            <thead>
              <tr>
                <th scope="col"> </th>
                {PUBLIC_PACKAGES.map((pkg) => <th key={pkg.id} scope="col">{pkg.name}{pkg.popular ? " · Most popular" : ""}</th>)}
              </tr>
            </thead>
            <tbody id="package-features">
              {featureRows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  {PUBLIC_PACKAGES.map((pkg) => <td key={pkg.id}>{row.cell(pkg)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="pricingSeeMore"
          aria-expanded={featuresOpen}
          aria-controls="package-features"
          onClick={() => setFeaturesOpen((open) => !open)}
        >
          {featuresOpen ? "See less" : "See more"}
          <ChevronDown size={16} aria-hidden />
        </button>
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
          Card processing is {PAYMENT_PROCESSOR}&apos;s rate, {PROCESSOR_RATE}<sup><a href="#processing-rate-note" aria-label="Footnote about processing rates">1</a></sup>, passed through. Vendors do not pay to look eligible.
        </p>
        <a href={VENDOR_PUBLIC_OFFER.href}>Vendor signup</a>
        <p className="summary pricingFootnote" id="processing-rate-note"><sup>1</sup> {PROCESSOR_RATE_NOTE}</p>
      </section>
    </div>
  );
}
