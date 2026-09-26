"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import VendorPortalFrame from "@/components/vendor-portal-frame";

type DeskJob = {
  id: string;
  title: string;
  address: string;
  city: string;
  status: string;
  fieldUrl: string;
};

type Opportunity = {
  id: string;
  title: string;
  address?: string;
  city?: string;
  state?: string;
  budgetCents: number | null;
  neededBy?: string | null;
  bidUrl?: string | null;
  ownBidCents?: number | null;
  ownBidSource?: string | null;
  leadingCents?: number | null;
  bidBlocked?: string | null;
  accessSummary?: string | null;
  autobidBlocked?: string | null;
};

const money = (cents?: number | null) =>
  cents == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

const statusLabel: Record<string, string> = {
  assigned: "Assigned",
  on_site: "On site",
  departed: "Departed",
  completed: "Closed",
};

export default function VendorDeskPage() {
  const router = useRouter();
  const [vendorName, setVendorName] = useState("Your jobs");
  const [jobs, setJobs] = useState<DeskJob[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [summary, setSummary] = useState("");
  const [message, setMessage] = useState("Loading vendor desk…");

  useEffect(() => {
    Promise.all([
      fetch("/api/vendors/session").then(async (r) => ({ ok: r.ok, body: await r.json() })),
      fetch("/api/vendors/desk").then(async (r) => ({ ok: r.ok, body: await r.json() })),
      fetch("/api/vendors/opportunities").then(async (r) => ({ ok: r.ok, body: await r.json() })),
    ]).then(([session, desk, opportunitiesResponse]) => {
      if (!session.ok) { router.replace("/vendors/login"); return; }
      setVendorName(session.body.vendor?.name || "Your jobs");
      if (!desk.ok) { setMessage(desk.body.error || "Could not load jobs."); return; }
      setJobs(desk.body.jobs || []);
      setOpportunities(opportunitiesResponse.body.opportunities || []);
      setSummary(opportunitiesResponse.body.access?.summary || "");
      setMessage("");
    }).catch(() => setMessage("Could not load the vendor desk."));
  }, [router]);

  return (
    <VendorPortalFrame
      eyebrow="VENDOR DESK"
      title={vendorName}
      lede="Awarded jobs are here. Open opportunities are the bids the property manager has out that match your notification rules. Crews use the job link with no account."
    >
      {message && <div className="notice">{message}</div>}
      {summary && <div className="notice">{summary}</div>}
      <div className="sectionTitle"><h3>Open opportunities</h3><span>{opportunities.length}</span></div>
      <div className="credentialList">
        {opportunities.length ? opportunities.map((row) => (
          <div className="credential" key={row.id}>
            <div>
              <strong>{row.title}</strong>
              <span>
                {[row.address, row.city, row.state].filter(Boolean).join(" · ")}
                {row.budgetCents != null ? ` · Budget ${money(row.budgetCents)}` : ""}
                {row.ownBidCents != null ? ` · Your ${row.ownBidSource || "bid"} ${money(row.ownBidCents)}` : ""}
                {row.leadingCents != null ? ` · Leading ${money(row.leadingCents)}` : ""}
              </span>
              {row.bidBlocked && <span>{row.bidBlocked}</span>}
              {!row.bidBlocked && row.autobidBlocked && row.autobidBlocked !== "Autobid is off" && <span>Autobid held: {row.autobidBlocked}</span>}
            </div>
            {row.bidUrl && <a className="primary" href={row.bidUrl}>Open bid</a>}
          </div>
        )) : !message && <div className="empty">No matching opportunities right now. Adjust bid settings if the filters are tighter than the work you want.</div>}
      </div>
      <div className="sectionTitle"><h3>Awarded jobs</h3><span>Crew link needs no login</span></div>
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
    </VendorPortalFrame>
  );
}
