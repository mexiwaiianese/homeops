"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { moneyCents } from "@/lib/rent";

type SyncMode = "manual" | "automatic" | "once" | "recurring";
type Schedule = {
  frequency?: "daily" | "weekly" | "monthly";
  time?: string;
  weekday?: number;
  dayOfMonth?: number;
  timezone?: string;
  onceAt?: string;
  completedAt?: string;
};
type Run = {
  id: string;
  trigger: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  pulled: number;
  pushed: number;
  matched: number;
  review: number;
  error: string;
};
type OpenItem = { id: string; txDate: string; name: string; amountCents: number; flowType: string; accountName: string };
type Status = {
  configured?: boolean;
  environment?: string;
  redirectUri?: string;
  status?: "disconnected" | "connected" | "error";
  companyName?: string;
  realmId?: string;
  syncMode?: SyncMode;
  schedule?: Schedule;
  nextRunAt?: string | null;
  lastSyncedAt?: string | null;
  lastError?: string;
  due?: boolean;
  needsReview?: number;
  openItems?: OpenItem[];
  runs?: Run[];
  error?: string;
};

const ZONES = [
  ["America/Denver", "Mountain"],
  ["America/Phoenix", "Arizona"],
  ["America/Los_Angeles", "Pacific"],
  ["America/Chicago", "Central"],
  ["America/New_York", "Eastern"],
  ["America/Anchorage", "Alaska"],
  ["Pacific/Honolulu", "Hawaii"],
  ["UTC", "UTC"],
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NOTICES: Record<string, string> = {
  connected: "QuickBooks is connected.",
  failed: "QuickBooks did not finish connecting. Try again.",
  invalid: "That QuickBooks link expired. Start the connection again.",
  unconfigured: "Add the QuickBooks client id and secret on the server, then connect.",
  setup: "Set INTEGRATION_ENCRYPTION_KEY on the server before connecting QuickBooks.",
  auth: "Sign in as a manager to connect QuickBooks.",
};

export default function QboSync({ mode, onSynced, onReview }: { mode: string; onSynced: () => void; onReview: () => void }) {
  const [status, setStatus] = useState<Status>({});
  const [syncMode, setSyncMode] = useState<SyncMode>("manual");
  const [schedule, setSchedule] = useState<Schedule>({ frequency: "daily", time: "06:00", weekday: 1, dayOfMonth: 1, timezone: "America/Denver" });
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const tried = useRef("");

  async function load() {
    const response = await fetch("/api/financial/qbo", { cache: "no-store" });
    const payload = await response.json() as Status;
    setStatus(payload);
    if (payload.syncMode) setSyncMode(payload.syncMode);
    if (payload.schedule) setSchedule((current) => ({ ...current, ...payload.schedule }));
    if (!response.ok && payload.error) setNotice(payload.error);
    return payload;
  }

  async function syncNow() {
    setBusy("sync");
    setNotice("");
    const response = await fetch("/api/financial/qbo/sync", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) {
      setNotice(payload.error || "QuickBooks sync failed.");
      await load();
      return;
    }
    const result = payload.result || {};
    setNotice(`Synced ${result.pulled || 0} from QuickBooks and ${result.pushed || 0} back. ${result.matched || 0} matched to a door.`);
    await load();
    onSynced();
  }

  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get("qbo") || "";
    if (NOTICES[flag]) setNotice(NOTICES[flag]);
    if (mode !== "live") return;
    void load();
  }, [mode]);

  useEffect(() => {
    if (!status.due || !status.nextRunAt || tried.current === status.nextRunAt) return;
    tried.current = status.nextRunAt;
    void syncNow();
  }, [status.due, status.nextRunAt]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy("save");
    setNotice("");
    const response = await fetch("/api/financial/qbo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ syncMode, schedule }),
    });
    const payload = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) {
      setNotice(payload.error || "The schedule could not be saved.");
      return;
    }
    setStatus(payload);
    setNotice(syncMode === "manual" ? "Sync runs when you click Sync now." : "Schedule saved.");
  }

  async function disconnect() {
    if (!window.confirm("Disconnect QuickBooks? Books keeps the lines already copied.")) return;
    setBusy("disconnect");
    await fetch("/api/financial/qbo", { method: "DELETE" });
    setBusy("");
    setNotice("QuickBooks is disconnected.");
    await load();
  }

  if (mode !== "live") {
    return (
      <div className="panel">
        <div className="panelHead"><div><p className="eyebrow">QUICKBOOKS</p><h2>Connect a live workspace</h2></div></div>
        <p className="summary">QuickBooks Online connects from a live portonOS workspace. Demo books stay on this device.</p>
      </div>
    );
  }

  const connected = status.status === "connected" || status.status === "error";
  return (
    <div className="panel">
      <div className="panelHead">
        <div>
          <p className="eyebrow">QUICKBOOKS ONLINE</p>
          <h2>{status.companyName || (connected ? "Company connected" : "Connect the company file")}</h2>
        </div>
      </div>
      <p className="summary">Cash activity is copied both ways. HomeOps reads each QuickBooks line onto a door, an owner, and a category. Rent collected here, bills marked paid, and owner cash are copied back to QuickBooks. Enter a movement in one place so the same dollar is not counted twice.</p>
      {notice && <div className="backendBanner">{notice}</div>}
      {status.lastError && <div className="backendBanner">{status.lastError}</div>}
      <p className="summary">
        {connected
          ? `${status.status === "error" ? "Connection needs attention." : "Connected."} ${status.lastSyncedAt ? `Last sync ${new Date(status.lastSyncedAt).toLocaleString()}.` : "Sync has not run yet."}`
          : "Not connected."}
        {status.environment ? ` ${status.environment === "sandbox" ? "Sandbox" : "Production"} app.` : ""}
      </p>
      <div className="qboActions">
        {status.configured
          ? <a className="primary" href="/api/financial/qbo/start">{connected ? "Reconnect" : "Connect QuickBooks"}</a>
          : <button className="primary" type="button" disabled>Connect QuickBooks</button>}
        {connected && <button className="secondaryBtn" type="button" disabled={busy === "sync"} onClick={() => void syncNow()}>{busy === "sync" ? "Syncing…" : "Sync now"}</button>}
        {connected && <button className="textBtn" type="button" disabled={busy === "disconnect"} onClick={() => void disconnect()}>Disconnect</button>}
      </div>
      {status.redirectUri && (
        <p className="summary">Intuit must list this redirect exactly, then Save: {status.redirectUri}</p>
      )}

      {connected && (
        <form onSubmit={save}>
          <fieldset className="qboModes">
            <legend className="eyebrow">WHEN TO SYNC</legend>
            <Mode checked={syncMode === "manual"} onChange={() => setSyncMode("manual")} title="Manual" detail="Runs only when you click Sync now." />
            <Mode checked={syncMode === "automatic"} onChange={() => setSyncMode("automatic")} title="Automatic" detail="Runs about every 15 minutes while the scheduler is on." />
            <Mode checked={syncMode === "once"} onChange={() => setSyncMode("once")} title="One time" detail="Runs once at the date and time you choose." />
            <Mode checked={syncMode === "recurring"} onChange={() => setSyncMode("recurring")} title="Recurring" detail="Runs daily, weekly, or monthly." />
          </fieldset>
          {syncMode === "once" && (
            <div className="formGrid">
              <label>Date and time
                <input type="datetime-local" required value={schedule.onceAt || ""} onChange={(event) => setSchedule({ ...schedule, onceAt: event.target.value })} />
              </label>
              <Zone schedule={schedule} onChange={setSchedule} />
            </div>
          )}
          {syncMode === "recurring" && (
            <div className="formGrid">
              <label>Repeats
                <select value={schedule.frequency || "daily"} onChange={(event) => setSchedule({ ...schedule, frequency: event.target.value as Schedule["frequency"] })}>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </label>
              <label>Time
                <input type="time" required value={schedule.time || "06:00"} onChange={(event) => setSchedule({ ...schedule, time: event.target.value })} />
              </label>
              {schedule.frequency === "weekly" && (
                <label>Day
                  <select value={schedule.weekday ?? 1} onChange={(event) => setSchedule({ ...schedule, weekday: Number(event.target.value) })}>
                    {WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
                  </select>
                </label>
              )}
              {schedule.frequency === "monthly" && (
                <label>Day of month
                  <input type="number" min={1} max={28} value={schedule.dayOfMonth || 1} onChange={(event) => setSchedule({ ...schedule, dayOfMonth: Number(event.target.value) })} />
                </label>
              )}
              <Zone schedule={schedule} onChange={setSchedule} />
            </div>
          )}
          <div className="qboActions">
            <button className="primary" type="submit" disabled={busy === "save"}>{busy === "save" ? "Saving…" : "Save sync setting"}</button>
            {status.nextRunAt && syncMode !== "manual" && <span className="summary">Next sync {new Date(status.nextRunAt).toLocaleString()}.</span>}
            {syncMode === "once" && schedule.completedAt && <span className="summary">Last one-time sync {new Date(schedule.completedAt).toLocaleString()}.</span>}
          </div>
        </form>
      )}

      {!!status.needsReview && (
        <p className="summary">{status.needsReview} QuickBooks {status.needsReview === 1 ? "line needs" : "lines need"} a door. <button className="textBtn" type="button" onClick={onReview}>Open review</button></p>
      )}

      {!!status.openItems?.length && (
        <>
          <div className="panelHead"><div><p className="eyebrow">OPEN IN QUICKBOOKS</p><h2>Unpaid invoices and bills</h2></div></div>
          <p className="summary">These stay off door profit until QuickBooks records the payment. The payment then posts into Books.</p>
          <div className="compactLedger">
            {status.openItems.map((item) => (
              <div key={item.id}>
                <span><strong>{item.name}</strong><small>{item.txDate} · {item.accountName}</small></span>
                <b className={item.flowType}>{item.flowType === "income" ? "+" : "−"}{moneyCents(item.amountCents)}</b>
              </div>
            ))}
          </div>
        </>
      )}

      {!!status.runs?.length && (
        <>
          <div className="panelHead"><div><p className="eyebrow">RECENT SYNCS</p><h2>What moved</h2></div></div>
          <div className="compactLedger">
            {status.runs.map((run) => (
              <div key={run.id}>
                <span>
                  <strong>{label(run.trigger)} · {run.status}</strong>
                  <small>{run.startedAt ? new Date(run.startedAt).toLocaleString() : ""} · {run.pulled} in · {run.pushed} out · {run.matched} on doors{run.error ? ` · ${run.error}` : ""}</small>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Mode({ checked, onChange, title, detail }: { checked: boolean; onChange: () => void; title: string; detail: string }) {
  return (
    <label>
      <input type="radio" name="qbo-sync-mode" checked={checked} onChange={onChange} />
      <span><strong>{title}</strong><span>{detail}</span></span>
    </label>
  );
}

function Zone({ schedule, onChange }: { schedule: Schedule; onChange: (next: Schedule) => void }) {
  return (
    <label>Time zone
      <select value={schedule.timezone || "America/Denver"} onChange={(event) => onChange({ ...schedule, timezone: event.target.value })}>
        {ZONES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
  );
}

function label(trigger: string) {
  if (trigger === "once") return "One time";
  if (trigger === "automatic") return "Automatic";
  if (trigger === "recurring") return "Recurring";
  return "Manual";
}
