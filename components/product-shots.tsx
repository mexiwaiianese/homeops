"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

function ProductPhoto({
  src,
  alt,
  caption,
  width,
  height,
}: {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
}) {
  return (
    <figure className="productPhoto">
      <Image src={src} alt={alt} width={width} height={height} sizes="(max-width: 900px) 90vw, 520px" />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export function ManagerInboxShot() {
  return (
    <ProductPhoto
      src="/product/manager-inbox.png"
      width={631}
      height={867}
      alt="portonOS manager desk showing the operations inbox, with a no-heat emergency and a water-heater job waiting on owner approval"
      caption="Manager desk · what needs you"
    />
  );
}

function ManagerNeedsYouShot() {
  return (
    <ProductPhoto
      src="/product/manager-needs-you.png"
      width={628}
      height={848}
      alt="portonOS operations inbox, with a no-heat emergency, a water-heater auction, a humming disposal, and a drywall patch waiting on a decision"
      caption="Manager desk · what needs you"
    />
  );
}

function TenantPortalShot() {
  return (
    <ProductPhoto
      src="/product/tenant-portal.png"
      width={617}
      height={935}
      alt="portonOS tenant portal for Demo Tenant Three, with the balance due, a way to report a problem, and open repair requests"
      caption="Tenant portal · balance, requests, and payments"
    />
  );
}

export function HomePassportShot() {
  return (
    <ProductPhoto
      src="/product/home-passport.png"
      width={627}
      height={864}
      alt="portonOS home record for 100 Demo Lane, with the owner, tenant, rent, reserve, systems, and operating rules"
      caption="Home record · owner, rent, and operating rules"
    />
  );
}

export function OwnerShot() {
  return (
    <ProductPhoto
      src="/product/owner-money.png"
      width={630}
      height={816}
      alt="portonOS owner view with maintenance per door, expected repairs, reserve on hand, and an income versus expenses chart"
      caption="Owner view · income, repairs, and the reserve"
    />
  );
}

function OwnerResultsShot() {
  return (
    <ProductPhoto
      src="/product/owner-results.png"
      width={628}
      height={663}
      alt="portonOS owner view of property results for 100 Demo Lane and 200 Sample Avenue, plus closed monthly periods"
      caption="Owner view · results by property and closed periods"
    />
  );
}

function OwnerStatementShot() {
  return (
    <ProductPhoto
      src="/product/owner-statement.png"
      width={631}
      height={738}
      alt="portonOS owner statement for September 2026, with profit and loss, cash flow, and open maintenance"
      caption="Owner view · statement and open maintenance"
    />
  );
}

export function VendorShot() {
  return (
    <ProductPhoto
      src="/product/vendor-desk.png"
      width={627}
      height={810}
      alt="portonOS vendor desk for Wasatch Comfort Heating, with invited open opportunities and no awarded jobs yet"
      caption="Vendor desk · invited jobs"
    />
  );
}

function VendorBidShot() {
  return (
    <ProductPhoto
      src="/product/vendor-bid.png"
      width={544}
      height={687}
      alt="portonOS invited bid for an AC job, with the leading bid, budget, and a place to enter your bid"
      caption="Vendor view · invited bid"
    />
  );
}

function VendorInvoiceShot() {
  return (
    <ProductPhoto
      src="/product/vendor-invoice.png"
      width={608}
      height={840}
      alt="portonOS vendor invoice for an AC job, billed to the property manager"
      caption="Vendor view · invoice for the job"
    />
  );
}

export function HeroRoleShots() {
  return (
    <div className="marketingShots" aria-label="One screen for managers, owners, and vendors">
      <div className="marketingShot marketingShot-manager">
        <span className="marketingShotBadge">Manager</span>
        <ManagerInboxShot />
      </div>
      <div className="marketingShot marketingShot-owner">
        <span className="marketingShotBadge">Owner</span>
        <OwnerShot />
      </div>
      <div className="marketingShot marketingShot-vendor">
        <span className="marketingShotBadge">Vendor</span>
        <VendorShot />
      </div>
    </div>
  );
}

function ShotCarousel({ label, children }: { label: string; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  function updateEdges() {
    const el = track.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 2,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
    });
  }

  useEffect(() => {
    updateEdges();
    const el = track.current;
    if (!el) return;
    el.addEventListener("scroll", updateEdges, { passive: true });
    window.addEventListener("resize", updateEdges);
    return () => {
      el.removeEventListener("scroll", updateEdges);
      window.removeEventListener("resize", updateEdges);
    };
  }, []);

  function move(direction: -1 | 1) {
    const el = track.current;
    if (!el) return;
    const slide = el.querySelector<HTMLElement>(".productPhoto");
    const distance = (slide?.offsetWidth ?? 320) + 16;
    el.scrollBy({ left: direction * distance, behavior: "smooth" });
  }

  return (
    <div className="shotCarousel">
      <div className="shotCarouselControls" hidden={edges.start && edges.end}>
        <button type="button" className="shotCarouselBtn" aria-label={`Show previous ${label}`} onClick={() => move(-1)} disabled={edges.start}>
          <ChevronLeft size={18} aria-hidden />
        </button>
        <button type="button" className="shotCarouselBtn" aria-label={`Show next ${label}`} onClick={() => move(1)} disabled={edges.end}>
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>
      <div
        className="shotCarouselTrack"
        ref={track}
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label={label}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            event.preventDefault();
            move(1);
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            move(-1);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function RoleScreens({ role }: { role: "manager" | "owner" | "vendor" }) {
  if (role === "manager") {
    return (
      <ShotCarousel key="manager" label="manager screens">
        <ManagerNeedsYouShot />
        <HomePassportShot />
        <TenantPortalShot />
      </ShotCarousel>
    );
  }
  if (role === "owner") {
    return (
      <ShotCarousel key="owner" label="owner screens">
        <OwnerResultsShot />
        <OwnerStatementShot />
      </ShotCarousel>
    );
  }
  return (
    <ShotCarousel key="vendor" label="vendor screens">
      <VendorBidShot />
      <VendorInvoiceShot />
    </ShotCarousel>
  );
}
