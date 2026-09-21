"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import BrandLockup from "@/components/brand-lockup";

export default function MaintenanceIntakePage() {
  const params = useParams<{ token: string }>();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emergency, setEmergency] = useState(false);
  const [availability, setAvailability] = useState("");
  const [state, setState] = useState<"idle"|"sending"|"done"|"error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setState("sending");
    const response = await fetch(`/api/maintenance/intake/${params.token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, description, emergency, availability }) });
    const result = await response.json();
    if (!response.ok) { setMessage(result.error || "Could not submit request"); setState("error"); return; }
    setMessage(`Request ${result.requestId.slice(0,8)} received. Your property manager can now triage it.`); setState("done");
  }

  return <main className="intakeShell"><section className="intakeCard"><BrandLockup artwork="lockup" />{state === "done" ? <div className="successPanel"><p className="eyebrow">REQUEST RECEIVED</p><h1>We have it.</h1><p>{message}</p><p>If conditions become dangerous—fire, active flooding, gas smell, or immediate threat to life—contact emergency services or the appropriate utility emergency line.</p></div> : <form onSubmit={submit}><p className="eyebrow">TENANT MAINTENANCE INTAKE</p><h1>What needs attention?</h1><p>Describe the problem clearly. Photos will be added in the next integration step.</p><label>Short summary<input required value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Furnace is not heating" /></label><label>What is happening?<textarea required rows={6} value={description} onChange={e=>setDescription(e.target.value)} placeholder="What did you notice? When did it start? What have you already tried?" /></label><label>Best access times<input value={availability} onChange={e=>setAvailability(e.target.value)} placeholder="e.g. weekdays after 3 PM" /></label><label className="checkRow"><input type="checkbox" checked={emergency} onChange={e=>setEmergency(e.target.checked)} /><span><strong>Potential emergency</strong><small>Active flooding, no heat in dangerous weather, electrical hazard, etc.</small></span></label><button className="primary" disabled={state === "sending"}>{state === "sending" ? "Submitting…" : "Submit maintenance request"}</button>{state === "error" && <div className="notice error">{message}</div>}</form>}</section></main>;
}
