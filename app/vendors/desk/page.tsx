"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BrandLockup from "@/components/brand-lockup";
import { leavePersona } from "@/lib/persona-sign-out-client";

type DeskJob = {
  id: string;
  title: string;
  address: string;
  city: string;
  status: string;
  fieldUrl: string;
  awardedAt: string;
  arrivedAt?: string | null;
  departedAt?: string | null;
};

type Vendor = { id: string; name: string; trade?: string; city?: string };

const statusLabel: Record<string, string> = {
  assigned: "Assigned",
  on_site: "On site",
  departed: "Departed",
  completed: "Closed",
};

export default function VendorDeskPage() {
  const router = useRouter();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [jobs, setJobs] = useState<DeskJob[]>([]);
  const [message, setMessage] = useState("Loading vendor desk…");

  useEffect(() => {
    Promise.all([
      fetch("/api/vendors/session").then(async (r) => ({ ok: r.ok, body: await r.json() })),
      fetch("/api/vendors/desk").then(async (r) => ({ ok: r.ok, body: await r.json() })),
    ]).then(([session, desk]) => {
      if (!session.ok) { router.replace("/vendors/login"); return; }
      setVendor(session.body.vendor);
      if (!desk.ok) { setMessage(desk.body.error || "Could not load jobs."); return; }
      setJobs(desk.body.jobs || []);
      setMessage("");
    }).catch(() => setMessage("Could not load the vendor desk."));
  }, [router]);

  async function signOut() {
    await leavePersona("/api/vendors/session", "/vendors/login");
  }

  return (
    <main className="intakeShell">
      <section className="intakeCard jobCard">
        <div className="deskHead">
          <BrandLockup artwork="lockup" />
          <button className="textBtn" onClick={() => void signOut()}>Sign out</button>
        </div>
        <p className="eyebrow">VENDOR DESK</p>
        <h1>{vendor?.name || "Your jobs"}</h1>
        <p>{vendor?.trade ? `${vendor.trade} · ` : ""}Signed-in view of awarded work. Share the crew link so techs can record the visit without an account.</p>
        {message && <div className="notice">{message}</div>}
        <div className="credentialList">
          {jobs.length ? jobs.map((job) => (
            <div className="credential" key={job.id}>
              <div>
                <strong>{job.title}</strong>
                <span>{job.address}{job.city ? ` · ${job.city}` : ""} · {statusLabel[job.status] || job.status}</span>
              </div>
              <a className="primary" href={job.fieldUrl}>Open crew link</a>
            </div>
          )) : !message && <div className="empty">No awarded jobs yet. When a manager awards or assigns work, it appears here.</div>}
        </div>
      </section>
    </main>
  );
}
