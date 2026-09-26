"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import VendorPortalFrame from "@/components/vendor-portal-frame";

type CrewMember = {
  id: string;
  name: string;
  email: string;
  phone: string;
  accessUrl: string;
  jobTokens: string[];
};

type Job = { token: string; title: string; address: string; city: string; status: string };

export default function VendorCrewPage() {
  const router = useRouter();
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  function apply(body: { crew?: CrewMember[]; jobs?: Job[]; error?: string }) {
    if (body.error) { setMessage(body.error); return; }
    setCrew(body.crew || []);
    setJobs(body.jobs || []);
  }

  useEffect(() => {
    fetch("/api/vendors/crew").then(async (r) => {
      if (r.status === 401) { router.replace("/vendors/login"); return null; }
      return r.json();
    }).then((body) => { if (body) apply(body); }).catch(() => setMessage("Could not load the crew."));
  }, [router]);

  async function add(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/vendors/crew", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, phone }),
    });
    const body = await response.json();
    if (!response.ok) { setMessage(body.error || "Could not add this person."); return; }
    setName(""); setEmail(""); setPhone("");
    setMessage("Crew member added. Send them their link. They do not need an account.");
    apply(body);
  }

  async function toggle(member: CrewMember, job: Job) {
    const assigned = member.jobTokens.includes(job.token);
    const response = await fetch("/api/vendors/crew", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ crewId: member.id, jobToken: job.token, assign: !assigned }),
    });
    const body = await response.json();
    if (!response.ok) { setMessage(body.error || "Could not update the assignment."); return; }
    apply(body);
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Crew link copied.");
    } catch {
      setMessage(url);
    }
  }

  return (
    <VendorPortalFrame
      eyebrow="CREW"
      title="Add people by email and cell."
      lede="Crew members do not sign in. Their link shows the jobs they are on and opens the job report for arrival, photos, and departure."
    >
      {message && <div className="notice">{message}</div>}
      <form className="formGrid" onSubmit={add}>
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" /></label>
        <label>Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tech@company.com" /></label>
        <label>Cell phone<input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(801) 555-0100" /></label>
        <button className="primary" type="submit">Add crew member</button>
      </form>
      <div className="credentialList">
        {crew.map((member) => (
          <div className="credential" key={member.id}>
            <div>
              <strong>{member.name}</strong>
              <span>{member.email} · {member.phone}</span>
              <span>No login. Jobs on this link: {member.jobTokens.length}</span>
              {jobs.length > 0 && (
                <span>
                  {jobs.map((job) => (
                    <label className="checkRow" key={job.token}>
                      <input type="checkbox" checked={member.jobTokens.includes(job.token)} onChange={() => void toggle(member, job)} />
                      <span>{job.title}</span>
                    </label>
                  ))}
                </span>
              )}
            </div>
            <button className="secondaryBtn" onClick={() => void copy(member.accessUrl)}>Copy crew link</button>
          </div>
        ))}
      </div>
    </VendorPortalFrame>
  );
}
