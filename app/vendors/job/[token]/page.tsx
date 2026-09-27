"use client";

import { useParams } from "next/navigation";
import BrandLockup from "@/components/brand-lockup";
import VendorJobReport from "@/components/vendor-job-report";

export default function VendorJobPage() {
  const params = useParams<{ token: string }>();

  return (
    <main className="intakeShell">
      <section className="intakeCard jobCard">
        <BrandLockup artwork="lockup" />
        <VendorJobReport token={params.token} />
        <p className="vendorAs">Dispatchers can see every job after signing in at the vendor desk.</p>
      </section>
    </main>
  );
}
