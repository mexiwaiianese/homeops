"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import BrandLockup from "@/components/brand-lockup";

type Job = {
  title: string;
  address: string;
  city: string;
  status: string;
  fieldUrl: string;
  arrivedAt?: string | null;
  departedAt?: string | null;
  completedAt?: string | null;
};

const statusLabel: Record<string, string> = {
  assigned: "Assigned",
  on_site: "On site",
  departed: "Departed",
  completed: "Closed",
};

export default function CrewAccessPage() {
  const params = useParams<{ token: string }>();
  const [name, setName] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [message, setMessage] = useState("Loading your jobs…");

  useEffect(() => {
    fetch(`/api/vendors/crew/access/${params.token}`)
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (!ok) { setMessage(body.error || "This crew link is not valid."); return; }
        setName(body.crew?.name || "Crew");
        setJobs(body.jobs || []);
        setMessage("");
      })
      .catch(() => setMessage("Could not load these jobs."));
  }, [params.token]);

  return (
    <main className="intakeShell">
      <section className="intakeCard jobCard">
        <BrandLockup artwork="lockup" />
        <p className="eyebrow">CREW JOBS</p>
        <h1>{name ? `${name}, your jobs` : "Your jobs"}</h1>
        <p>No sign-in. This page lists the visits you are on. Open a job report to record arrival, photos, notes, and departure.</p>
        {message && <div className="notice">{message}</div>}
        <div className="credentialList">
          {jobs.length ? jobs.map((job) => (
            <div className="credential" key={job.fieldUrl}>
              <div>
                <strong>{job.title}</strong>
                <span>{job.address}{job.city ? ` · ${job.city}` : ""} · {statusLabel[job.status] || job.status}</span>
                <span>
                  Arrived {job.arrivedAt ? new Date(job.arrivedAt).toLocaleString() : "—"}
                  {" · "}Left {job.departedAt ? new Date(job.departedAt).toLocaleString() : "—"}
                </span>
              </div>
              <a className="primary" href={job.fieldUrl}>Open job report</a>
            </div>
          )) : !message && <div className="empty">No jobs assigned yet. Your company adds you to a visit from their desk.</div>}
        </div>
      </section>
    </main>
  );
}
