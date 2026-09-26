"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import VendorPortalFrame from "@/components/vendor-portal-frame";

type RuleForm = {
  enabled: boolean;
  services: string[];
  minAmount: string;
  maxAmount: string;
  minNoticeHours: string;
  emergencyOnly: boolean;
  cities: string;
  states: string;
};

type AutobidForm = {
  enabled: boolean;
  maxAmount: string;
  minAmount: string;
  undercut: string;
  minNoticeHours: string;
  jobDurationHours: string;
};

const dollars = (cents?: number | null) => (cents == null ? "" : String(cents / 100));

export default function VendorSettingsPage() {
  const router = useRouter();
  const [services, setServices] = useState<string[]>([]);
  const [calendar, setCalendar] = useState("disconnected");
  const [summary, setSummary] = useState("");
  const [message, setMessage] = useState("");
  const [notify, setNotify] = useState<RuleForm>({
    enabled: true, services: [], minAmount: "", maxAmount: "", minNoticeHours: "4", emergencyOnly: false, cities: "", states: "",
  });
  const [autobid, setAutobid] = useState<AutobidForm>({
    enabled: false, maxAmount: "", minAmount: "", undercut: "25", minNoticeHours: "4", jobDurationHours: "2",
  });

  useEffect(() => {
    fetch("/api/vendors/settings").then(async (r) => {
      if (r.status === 401) { router.replace("/vendors/login"); return null; }
      return r.json();
    }).then((body) => {
      if (!body) return;
      if (body.error) { setMessage(body.error); return; }
      const offered = body.vendor?.services?.length ? body.vendor.services : body.notifications?.services || [];
      setServices(offered);
      setCalendar(body.calendar?.status || "disconnected");
      setSummary(body.access?.summary || "");
      const note = body.notifications || {};
      setNotify({
        enabled: note.enabled !== false,
        services: note.services?.length ? note.services : offered,
        minAmount: dollars(note.minAmountCents),
        maxAmount: dollars(note.maxAmountCents),
        minNoticeHours: String(note.minNoticeHours ?? 4),
        emergencyOnly: Boolean(note.emergencyOnly),
        cities: (note.cities || []).join(", "),
        states: (note.states || []).join(", "),
      });
      const auto = body.autobid || {};
      setAutobid({
        enabled: Boolean(auto.enabled),
        maxAmount: dollars(auto.maxAmountCents),
        minAmount: dollars(auto.minAmountCents),
        undercut: auto.undercutCents != null ? String(auto.undercutCents / 100) : "25",
        minNoticeHours: String(auto.minNoticeHours ?? 4),
        jobDurationHours: String(auto.jobDurationHours ?? 2),
      });
    }).catch(() => setMessage("Could not load settings."));
  }, [router]);

  function toggleService(service: string) {
    setNotify((current) => ({
      ...current,
      services: current.services.includes(service) ? current.services.filter((row) => row !== service) : [...current.services, service],
    }));
  }

  async function save(patch: Record<string, unknown>) {
    const response = await fetch("/api/vendors/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = await response.json();
    if (!response.ok) { setMessage(body.error || "Could not save."); return; }
    setCalendar(body.calendar?.status || calendar);
    setSummary(body.access?.summary || summary);
    setMessage("Saved. Notifications and autobid now use these limits.");
  }

  return (
    <VendorPortalFrame
      eyebrow="BID SETTINGS"
      title="What you hear about, and what autobid may do."
      lede="Notifications only go out for jobs inside the filters below. Autobid, when it is on, also has to stay inside its own floor, ceiling, undercut, notice window, and an open calendar slot. It will not bid on a job your notification rules reject, and it will not run until this company has three successful jobs or a property manager has allowed your company onto their properties."
    >
      {summary && <div className="notice">{summary}</div>}
      {message && <div className="notice">{message}</div>}

      <div className="sectionTitle"><h3>Bid notifications</h3><span>Only matching jobs</span></div>
      <div className="formGrid">
        <label className="checkRow">
          <input type="checkbox" checked={notify.enabled} onChange={(e) => setNotify({ ...notify, enabled: e.target.checked })} />
          <span><strong>Send bid notifications</strong><small>Off means no new opportunity alerts.</small></span>
        </label>
        <label className="checkRow">
          <input type="checkbox" checked={notify.emergencyOnly} onChange={(e) => setNotify({ ...notify, emergencyOnly: e.target.checked })} />
          <span><strong>Emergencies only</strong><small>Standard work stays quiet.</small></span>
        </label>
        <label>Minimum budget ($)
          <input type="number" min="0" value={notify.minAmount} onChange={(e) => setNotify({ ...notify, minAmount: e.target.value })} placeholder="Any" />
        </label>
        <label>Maximum budget ($)
          <input type="number" min="0" value={notify.maxAmount} onChange={(e) => setNotify({ ...notify, maxAmount: e.target.value })} placeholder="Any" />
        </label>
        <label>Minimum notice (hours)
          <input type="number" min="0" value={notify.minNoticeHours} onChange={(e) => setNotify({ ...notify, minNoticeHours: e.target.value })} />
        </label>
        <label>Cities
          <input value={notify.cities} onChange={(e) => setNotify({ ...notify, cities: e.target.value })} placeholder="Blank = any city" />
        </label>
        <label>States
          <input value={notify.states} onChange={(e) => setNotify({ ...notify, states: e.target.value })} placeholder="Blank = any state" />
        </label>
      </div>
      <div className="chipRow">
        {services.map((service) => (
          <label className="checkRow" key={service}>
            <input type="checkbox" checked={notify.services.includes(service)} onChange={() => toggleService(service)} />
            <span>{service}</span>
          </label>
        ))}
      </div>
      <button className="primary" onClick={() => void save({ notifications: notify })}>Save notification rules</button>

      <div className="sectionTitle"><h3>Autobid guardrails</h3><span>{calendar === "connected" ? "Calendar connected" : "Calendar required"}</span></div>
      <p className="summary">Autobid refuses to run without a floor and a ceiling. It will not bid above the ceiling, below the floor, inside the notice window, over the published budget, or onto a calendar that has no open slot. A property-manager allowance does not widen these numbers.</p>
      <div className="vendorFilters">
        {calendar === "connected"
          ? <button className="secondaryBtn" onClick={() => void save({ calendar: "disconnect" })}>Disconnect calendar</button>
          : <button className="secondaryBtn" onClick={() => void save({ calendar: "connect" })}>Connect service calendar</button>}
      </div>
      <div className="formGrid">
        <label className="checkRow">
          <input type="checkbox" checked={autobid.enabled} onChange={(e) => setAutobid({ ...autobid, enabled: e.target.checked })} />
          <span><strong>Enable autobid</strong><small>Still blocked until bidding access and a calendar slot both pass.</small></span>
        </label>
        <label>Ceiling ($)<input type="number" min="0" value={autobid.maxAmount} onChange={(e) => setAutobid({ ...autobid, maxAmount: e.target.value })} /></label>
        <label>Floor ($)<input type="number" min="0" value={autobid.minAmount} onChange={(e) => setAutobid({ ...autobid, minAmount: e.target.value })} /></label>
        <label>Undercut ($)<input type="number" min="1" value={autobid.undercut} onChange={(e) => setAutobid({ ...autobid, undercut: e.target.value })} /></label>
        <label>Minimum notice (hours)<input type="number" min="0" value={autobid.minNoticeHours} onChange={(e) => setAutobid({ ...autobid, minNoticeHours: e.target.value })} /></label>
        <label>Job duration (hours)<input type="number" min="1" value={autobid.jobDurationHours} onChange={(e) => setAutobid({ ...autobid, jobDurationHours: e.target.value })} /></label>
      </div>
      <button className="primary" onClick={() => void save({ autobid })}>Save autobid rules</button>
    </VendorPortalFrame>
  );
}
