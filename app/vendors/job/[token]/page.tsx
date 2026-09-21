"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import BrandLockup from "@/components/brand-lockup";

type JobLog = {
  id: string;
  kind: string;
  body: string | null;
  mimeType?: string | null;
  fileName?: string | null;
  url?: string | null;
  createdAt: string;
};

type Job = {
  title: string;
  address: string;
  city: string;
  vendorName: string;
  status: string;
  locationConfirmed: boolean;
  arrivedAt: string | null;
  departedAt: string | null;
  completedAt: string | null;
  logs: JobLog[];
};

function stamp(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function VendorJobPage() {
  const params = useParams<{ token: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [recording, setRecording] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  function load() {
    fetch(`/api/vendors/job/${params.token}`)
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (!ok) { setStatus("error"); setMessage(body.error || "This job link is not valid."); return; }
        setJob(body.job);
        setStatus("ready");
      })
      .catch(() => { setStatus("error"); setMessage("Could not load this job."); });
  }

  useEffect(() => { load(); }, [params.token]);

  async function coords() {
    if (!navigator.geolocation) return {};
    return new Promise<{ latitude?: number; longitude?: number }>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => resolve({}),
        { enableHighAccuracy: true, timeout: 2500 },
      );
    });
  }

  async function act(action: "arrive" | "leave" | "confirm" | "note") {
    setBusy(action);
    const location = action === "arrive" || action === "confirm" ? await coords() : {};
    const response = await fetch(`/api/vendors/job/${params.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note, ...location, confirmed: action === "confirm" }),
    });
    const body = await response.json();
    setBusy("");
    if (!response.ok) { setMessage(body.error || "Could not save that action."); return; }
    setJob(body.job);
    setNote("");
    setMessage("");
  }

  async function upload(file: File, caption = "") {
    setBusy("media");
    const form = new FormData();
    form.append("file", file);
    if (caption) form.append("caption", caption);
    const response = await fetch(`/api/vendors/job/${params.token}`, { method: "PUT", body: form });
    const body = await response.json();
    setBusy("");
    if (!response.ok) { setMessage(body.error || "Could not save that file."); return; }
    setJob(body.job);
    setMessage("");
  }

  async function toggleAudio() {
    if (recording && mediaRef.current) {
      mediaRef.current.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        void upload(new File([blob], `voice-${Date.now()}.webm`, { type: blob.type }), "Voice note");
      };
      mediaRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setMessage("Microphone access is needed for voice notes, or attach an audio file instead.");
    }
  }

  const closed = Boolean(job?.completedAt);
  const onSite = Boolean(job?.arrivedAt && !job?.departedAt);
  const left = Boolean(job?.departedAt);

  return (
    <main className="intakeShell">
      <section className="intakeCard jobCard">
        <BrandLockup artwork="lockup" />
        {status === "error" ? (
          <div className="successPanel">
            <p className="eyebrow">JOB LINK</p>
            <h1>This job is unavailable.</h1>
            <p>{message}</p>
          </div>
        ) : !job || status === "loading" ? (
          <p>Loading job site…</p>
        ) : (
          <>
            <p className="eyebrow">{job.vendorName}</p>
            <h1>{job.title}</h1>
            <p>{job.address}{job.city ? ` · ${job.city}` : ""}</p>
            <div className="miniStats vendorMini">
              <div><span>Status</span><strong>{onSite ? "On site" : left ? "Departed" : closed ? "Closed" : "Assigned"}</strong></div>
              <div><span>Arrived</span><strong>{stamp(job.arrivedAt)}</strong></div>
              <div><span>Left</span><strong>{stamp(job.departedAt)}</strong></div>
              <div><span>Location</span><strong>{job.locationConfirmed ? "Confirmed" : "Not confirmed"}</strong></div>
            </div>
            <p className="summary">No login needed on this page. Record the visit as you work. Do not upload W-9s, insurance, or tax files here.</p>
            {message && <div className="notice error">{message}</div>}
            {!closed && (
              <div className="visitActions">
                <button className="primary" disabled={Boolean(busy) || onSite} onClick={() => void act("arrive")}>
                  {busy === "arrive" ? "Saving…" : onSite ? "On site" : "I have arrived"}
                </button>
                <button className="secondaryBtn" disabled={Boolean(busy) || !onSite || job.locationConfirmed} onClick={() => void act("confirm")}>
                  {job.locationConfirmed ? "Location confirmed" : "Confirm this is the right location"}
                </button>
                <button className="secondaryBtn" disabled={Boolean(busy) || !onSite} onClick={() => void act("leave")}>
                  {busy === "leave" ? "Saving…" : "I am leaving"}
                </button>
              </div>
            )}
            {!closed && (
              <form onSubmit={(event: FormEvent) => { event.preventDefault(); void act("note"); }}>
                <label>Work note
                  <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you find, what did you repair, what still needs a part?" />
                </label>
                <button className="primary" disabled={Boolean(busy) || !note.trim()} type="submit">Save note</button>
              </form>
            )}
            {!closed && (
              <div className="mediaActions">
                <label className="fileBtn">Add photo, video, or audio
                  <input type="file" accept="image/*,video/*,audio/*" capture="environment" onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void upload(file);
                  }} />
                </label>
                <button className="secondaryBtn" type="button" onClick={() => void toggleAudio()}>
                  {recording ? "Stop voice note" : "Record voice note"}
                </button>
              </div>
            )}
            <div className="sectionTitle"><h3>Job log</h3><span>{job.logs.length} entries</span></div>
            <div className="jobLogList">
              {job.logs.length ? job.logs.slice().reverse().map((log) => (
                <div key={log.id} className="jobLogRow">
                  <strong>{log.kind}</strong>
                  <span>{log.body || log.fileName || ""}</span>
                  <small>{stamp(log.createdAt)}</small>
                  {log.url && log.mimeType?.startsWith("image/") && <img className="jobThumb" src={log.url} alt={log.fileName || "Job photo"} />}
                  {log.url && log.mimeType?.startsWith("video/") && <video className="jobThumb" src={log.url} controls />}
                  {log.url && log.mimeType?.startsWith("audio/") && <audio src={log.url} controls />}
                </div>
              )) : <div className="empty">No field notes yet. Mark arrival when you get there.</div>}
            </div>
            <p className="vendorAs">Dispatchers can see every job after signing in at the vendor desk.</p>
          </>
        )}
      </section>
    </main>
  );
}
