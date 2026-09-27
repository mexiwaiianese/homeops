"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import BrandLockup from "@/components/brand-lockup";
import VendorJobReport, { type ReportJob } from "@/components/vendor-job-report";

type Job = {
  token: string;
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

// The job the crew is on right now comes first, then jobs still waiting, then finished ones.
const statusOrder: Record<string, number> = { on_site: 0, assigned: 1, departed: 2, completed: 3 };

function jobFromQuery() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("job");
}

function rememberJob(token: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (token) url.searchParams.set("job", token);
  else url.searchParams.delete("job");
  window.history.replaceState({}, "", url.toString());
}

export default function CrewAccessPage() {
  const params = useParams<{ token: string }>();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [message, setMessage] = useState("Loading your jobs…");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => {
    return fetch(`/api/vendors/crew/access/${params.token}`, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (!ok) { setMessage(body.error || "This crew link is not valid."); return; }
        setName(body.crew?.name || "Crew");
        setCompany(body.crew?.companyName || "");
        const list: Job[] = (body.jobs || []).slice().sort((a: Job, b: Job) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));
        setJobs(list);
        setMessage("");
        // Reopen the job they were working on if the link was refreshed with ?job=.
        const wanted = jobFromQuery();
        if (wanted && list.some((job) => job.token === wanted)) setSelected(wanted);
      })
      .catch(() => setMessage("Could not load these jobs."));
  }, [params.token]);

  useEffect(() => { void load(); }, [load]);

  function pick(token: string) {
    setSelected(token);
    rememberJob(token);
    window.scrollTo({ top: 0 });
  }

  function back() {
    setSelected(null);
    rememberJob(null);
    void load();
  }

  // Keep the list's status in step with what the crew records on the report.
  function syncJob(token: string, report: ReportJob) {
    setJobs((rows) => rows.map((row) => row.token === token
      ? { ...row, status: report.completedAt ? "completed" : report.departedAt ? "departed" : report.arrivedAt ? "on_site" : "assigned", arrivedAt: report.arrivedAt, departedAt: report.departedAt, completedAt: report.completedAt }
      : row));
  }

  const current = selected ? jobs.find((job) => job.token === selected) : null;
  const onSiteJob = jobs.find((job) => job.status === "on_site");
  const openJobs = jobs.filter((job) => job.status !== "completed");

  return (
    <main className="intakeShell">
      <section className="intakeCard jobCard">
        <BrandLockup artwork="lockup" />
        {current ? (
          <>
            <button type="button" className="bidBack crewBack" onClick={back}>← Back to my jobs</button>
            <VendorJobReport token={current.token} onJobChange={(report) => syncJob(current.token, report)} />
            <p className="vendorAs">{name}, this report is for the job you picked. Go back to switch jobs.</p>
          </>
        ) : (
          <>
            <p className="eyebrow">{company ? `${company.toUpperCase()} · CREW` : "CREW JOBS"}</p>
            <h1>{name ? `${name}, which job is next?` : "Which job is next?"}</h1>
            <p>No sign-in. Only the jobs you are on are listed here. Pick the one you are heading to and the job report opens so you can record arrival, photos, notes, and departure.</p>
            {message && <div className="notice">{message}</div>}
            {onSiteJob && (
              <div className="notice">You are marked on site at {onSiteJob.title}. Open it to add notes or mark that you are leaving.</div>
            )}
            <div className="credentialList crewJobList">
              {jobs.length ? jobs.map((job) => {
                const done = job.status === "completed";
                return (
                  <div className={`credential${job.status === "on_site" ? " crewJobActive" : ""}`} key={job.token}>
                    <div>
                      <strong>{job.title}</strong>
                      <span>{job.address}{job.city ? ` · ${job.city}` : ""} · {statusLabel[job.status] || job.status}</span>
                      <span>
                        Arrived {job.arrivedAt ? new Date(job.arrivedAt).toLocaleString() : "—"}
                        {" · "}Left {job.departedAt ? new Date(job.departedAt).toLocaleString() : "—"}
                      </span>
                    </div>
                    <button type="button" className={done ? "secondaryBtn" : "primary"} onClick={() => pick(job.token)}>
                      {job.status === "on_site" ? "Continue this job" : done ? "View report" : "Work on this next"}
                    </button>
                  </div>
                );
              }) : !message && <div className="empty">No jobs assigned yet. Your company adds you to a visit from their desk.</div>}
            </div>
            {jobs.length > 0 && !openJobs.length && <p className="vendorAs">Every job on your list is closed. New visits show up here when your company adds you.</p>}
          </>
        )}
      </section>
    </main>
  );
}
