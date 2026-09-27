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
  linkSentAt: string | null;
  linkSummary: string | null;
};

type Job = { token: string; title: string; address: string; city: string; status: string };

type Delivery = { channel: "email" | "sms" | null; sentTo: string | null; sent: boolean; error?: string | null };

function deliveryNote(delivery: Delivery | null | undefined, lead: string) {
  if (!delivery) return `${lead} Copy the link and send it yourself.`;
  if (delivery.sent) return `${lead} Their link went out by ${delivery.channel === "sms" ? "text" : "email"} to ${delivery.sentTo}.`;
  return `${lead} The link could not be sent (${delivery.error || "delivery failed"}). Copy it and send it yourself.`;
}

export default function VendorCrewPage() {
  const router = useRouter();
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState("");

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
    setMessage(deliveryNote(body.delivery, "Crew member added. They do not need an account."));
    apply(body);
  }

  async function send(member: CrewMember) {
    setSending(member.id);
    const response = await fetch("/api/vendors/crew", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ crewId: member.id, action: "send" }),
    });
    const body = await response.json();
    setSending("");
    if (!response.ok) { setMessage(body.error || "Could not send the link."); return; }
    setMessage(deliveryNote(body.delivery, `Link for ${member.name}:`));
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
    setMessage(assigned
      ? `${member.name} was taken off ${job.title}.`
      : deliveryNote(body.delivery, `${member.name} was added to ${job.title}.`));
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
      lede="Crew members do not sign in. New people get their link by email and text automatically, and checking a job on their list sends them that visit. The link shows only the jobs they are on; they pick the one they are heading to and the job report opens for arrival, photos, and departure."
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
              <span className={member.linkSentAt && member.linkSummary && !/^Sent/.test(member.linkSummary) ? "crewLinkWarn" : undefined}>
                {member.linkSentAt
                  ? `Link ${/^Sent/.test(member.linkSummary || "") ? member.linkSummary!.replace(/^Sent/, "sent") : `not delivered · ${member.linkSummary}`} · ${new Date(member.linkSentAt).toLocaleString()}`
                  : "Link not sent yet"}
              </span>
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
            <div className="crewActions">
              <button className="primary" disabled={Boolean(sending)} onClick={() => void send(member)}>
                {sending === member.id ? "Sending…" : member.linkSentAt ? "Send link again" : "Send link"}
              </button>
              <button className="secondaryBtn" onClick={() => void copy(member.accessUrl)}>Copy crew link</button>
            </div>
          </div>
        ))}
      </div>
    </VendorPortalFrame>
  );
}
