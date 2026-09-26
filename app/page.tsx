"use client";

import { useEffect, useState } from "react";
import BrandLockup from "@/components/brand-lockup";
import BrandIcon from "@/components/brand-icon";
import ManagerSignOut from "@/components/manager-sign-out";
import { homes as seedHomes, initialMaintenance, owners as seedOwners, tenants as seedTenants, type MaintenanceStatus } from "@/lib/data";
import { parseOrgSettings } from "@/lib/org-settings";
import SettingsModal from "@/components/settings-modal";
import AuctionBoard from "@/components/auction-board";

const money = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
const nav = ["Today", "Homes", "Owners", "Tenants", "Maintenance"] as const;
const navIcons = {
  Today: "applications",
  Homes: "listing",
  Owners: "applications",
  Tenants: "tenants",
  Maintenance: "maintenance",
} as const;
type Tab = (typeof nav)[number];
type OwnerUI = (typeof seedOwners)[number];
type HomeUI = (typeof seedHomes)[number];
type TenantUI = (typeof seedTenants)[number];
type MaintenanceUI = (typeof initialMaintenance)[number];
type BackendMode = "checking" | "demo" | "live" | "auth" | "error";

export default function HomeOps() {
  const [tab, setTab] = useState<Tab>("Today");
  const [homes, setHomes] = useState<HomeUI[]>(seedHomes);
  const [owners, setOwners] = useState<OwnerUI[]>(seedOwners);
  const [tenants, setTenants] = useState<TenantUI[]>(seedTenants);
  const [maintenance, setMaintenance] = useState<MaintenanceUI[]>(initialMaintenance);
  const [selectedHome, setSelectedHome] = useState(seedHomes[0].id);
  const [backendMode, setBackendMode] = useState<BackendMode>("checking");
  const [editingOwner, setEditingOwner] = useState<OwnerUI | null>(null);
  const [addingHome, setAddingHome] = useState(false);
  const [toast, setToast] = useState("");
  const [dispatching,setDispatching]=useState<MaintenanceUI|null>(null);
  const [closing,setClosing]=useState<MaintenanceUI|null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoAssignAlwaysOn, setAutoAssignAlwaysOn] = useState(false);
  const [jobAutoAssign, setJobAutoAssign] = useState<Record<string, boolean>>({});
  const [auctioning, setAuctioning] = useState<MaintenanceUI | null>(null);
  const [openAuctions, setOpenAuctions] = useState<Record<string, boolean>>({});
  const [rentSummary, setRentSummary] = useState<{ paidCount: number; dueCount: number; paidCents: number; dueCents: number } | null>(null);

  useEffect(() => {
    fetch("/api/bootstrap")
      .then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json() }))
      .then(({ ok, status, body }) => {
        if (status === 401) { setBackendMode("auth"); return; }
        if (!ok) { setBackendMode("error"); return; }
        if (body.mode === "demo") {
          const demoSettings = parseOrgSettings(body.settings);
          const demoMaintenance: MaintenanceUI[] = Array.isArray(body.maintenance) && body.maintenance.length ? body.maintenance : initialMaintenance;
          setBackendMode("demo");
          setMaintenance(demoMaintenance);
          setAutoAssignAlwaysOn(demoSettings.autoAssignAlwaysOn);
          setJobAutoAssign(Object.fromEntries(demoMaintenance.map((row) => [row.id, row.vendorId ? false : demoSettings.autoAssignAlwaysOn])));
          return;
        }
        setBackendMode("live");
        const liveSettings = parseOrgSettings(body.settings);
        const mappedOwners: OwnerUI[] = (body.owners ?? []).map((o: any) => ({
          id: o.id, name: o.full_name, email: o.email ?? "", homes: (body.homes ?? []).filter((h: any) => h.owner_id === o.id).length,
          auth: (o.maintenance_authority_cents ?? 0) / 100, emergency: (o.emergency_authority_cents ?? 0) / 100,
          reserve: (o.minimum_reserve_cents ?? 0) / 100, notifyOver: (o.notify_over_cents ?? 0) / 100,
          disbursement: o.disbursement_day ? `${o.disbursement_day}${ordinal(o.disbursement_day)} monthly` : "Not set", preferred: o.preferred_vendor_name || "Not set",
        }));
        const leaseByHome = new Map((body.leases ?? []).map((l: any) => [l.home_id, l]));
        const mappedTenants: TenantUI[] = (body.leases ?? []).map((l: any) => ({
          id: l.tenants.id, name: l.tenants.full_name, phone: l.tenants.phone ?? "", email: l.tenants.email ?? "",
          home: `${(body.homes ?? []).find((h: any) => h.id === l.home_id)?.address1 ?? "Home"}`,
          balance: (l.balance_cents ?? 0) / 100,
        }));
        const mappedHomes: HomeUI[] = (body.homes ?? []).map((h: any) => {
          const lease: any = leaseByHome.get(h.id);
          return {
            id: h.id, address: h.address1, city: `${h.city}, ${h.state}`, ownerId: h.owner_id, tenantId: lease?.tenant_id ?? "",
            rent: (h.monthly_rent_cents ?? lease?.rent_cents ?? 0) / 100, reserve: (h.reserve_balance_cents ?? 0) / 100,
            health: h.health_status, leaseEnds: lease?.ends_on ?? "",
            systems: (h.home_assets ?? []).map((a: any) => ({ name: a.category, detail: [a.manufacturer, a.model].filter(Boolean).join(" ") || "Details not recorded", age: a.installed_on ? `Installed ${String(a.installed_on).slice(0,4)}` : "Age unknown", next: a.next_service_on ? `Service ${a.next_service_on}` : "No service date" })),
            access: Array.isArray(h.access_notes) ? h.access_notes : [],
          };
        });
        const mappedMaintenance: MaintenanceUI[] = (body.maintenance ?? []).map((m: any) => ({
          id: m.id, homeId: m.home_id, title: m.title, tenant: m.tenants?.full_name ?? "Tenant", priority: capitalize(m.priority) as MaintenanceUI["priority"], status: capitalize(m.status) as MaintenanceStatus,
          estimate: (m.estimated_cost_cents ?? 0) / 100, note: m.description || m.diagnosis?.summary || "Awaiting triage notes.",
          vendorId: m.vendor_id ?? null, vendorName: m.vendors?.name ?? null,
        }));
        setAutoAssignAlwaysOn(liveSettings.autoAssignAlwaysOn);
        setJobAutoAssign(Object.fromEntries(mappedMaintenance.map((row: MaintenanceUI) => [row.id, Boolean(row.vendorId) ? false : liveSettings.autoAssignAlwaysOn])));
        if (mappedOwners.length) setOwners(mappedOwners);
        if (mappedHomes.length) { setHomes(mappedHomes); setSelectedHome(mappedHomes[0].id); }
        if (mappedTenants.length) setTenants(mappedTenants);
        if (mappedMaintenance.length) setMaintenance(mappedMaintenance);
      })
      .catch(() => setBackendMode("error"));
    fetch("/api/rent/charges")
      .then((r) => r.json())
      .then((body) => { if (body.summary) setRentSummary(body.summary); })
      .catch(() => {});
  }, []);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3000); return () => clearTimeout(t); }, [toast]);

  const home = homes.find((h) => h.id === selectedHome) ?? homes[0];
  const owner = home ? owners.find((o) => o.id === home.ownerId) : owners[0];
  const tenant = home ? tenants.find((t) => t.id === home.tenantId) : tenants[0];
  const attention = maintenance.filter((m) => m.status !== "Documented").length;
  const collected = tenants.filter((t) => t.balance === 0).length;
  const monthlyRent = homes.reduce((s, h) => s + h.rent, 0);

  const flow: MaintenanceStatus[] = ["Diagnose", "Authorize", "Dispatch", "Scheduled", "Repair", "Invoice", "Documented"];

  async function persistStatus(item: MaintenanceUI, status: MaintenanceStatus, performance?: Record<string, unknown>) {
    if (backendMode === "live" || backendMode === "demo") {
      const r = await fetch(`/api/maintenance/${item.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, performance }),
      });
      const body = await r.json();
      if (!r.ok) { setToast(body.error || "Could not update maintenance status"); return false; }
    }
    setMaintenance((rows) => rows.map((m) => m.id === item.id ? { ...m, status } : m));
    return true;
  }

  const nextStatus = (id: string) => {
    const current = maintenance.find((m) => m.id === id);
    if (!current || current.status === "Documented") return;
    const status = flow[Math.min(flow.indexOf(current.status) + 1, flow.length - 1)];
    if (status === "Documented") { setClosing(current); return; }
    if (current.status === "Authorize" && jobAutoAssign[current.id] && !current.vendorId) {
      void autoAssign(current);
      return;
    }
    if (current.status === "Authorize" && !current.vendorId) {
      if (openAuctions[current.id]) {
        void endAuction(current);
        return;
      }
      void startAuction(current);
      return;
    }
    void persistStatus(current, status);
  };

  async function startAuction(item: MaintenanceUI) {
    const response = await fetch(`/api/maintenance/${item.id}/auction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budgetCents: item.estimate ? Math.round(item.estimate * 100) : null,
      }),
    });
    const body = await response.json();
    if (!response.ok) { setToast(body.error || "Could not open auction"); return; }
    setOpenAuctions((current) => ({ ...current, [item.id]: true }));
    setAuctioning(item);
    setToast(body.message || `Auction opened for ${body.invited ?? "eligible"} vendors`);
  }

  async function endAuction(item: MaintenanceUI) {
    const response = await fetch(`/api/maintenance/${item.id}/auction`, { method: "DELETE" });
    const body = await response.json();
    if (!response.ok) { setToast(body.error || "Could not end auction"); return; }
    setOpenAuctions((current) => ({ ...current, [item.id]: false }));
    if (auctioning?.id === item.id) setAuctioning(null);
    setToast("Auction ended without an award");
  }

  async function autoAssign(item: MaintenanceUI) {
    const response = await fetch(`/api/maintenance/${item.id}/auto-assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budgetCents: Math.round((item.estimate || 0) * 100) }),
    });
    const body = await response.json();
    if (!response.ok) {
      setToast(body.error || "Could not auto-assign a vendor");
      setDispatching(item);
      return;
    }
    setMaintenance((rows) => rows.map((row) => row.id === item.id ? {
      ...row,
      status: "Dispatch",
      vendorId: body.vendor?.id ?? row.vendorId,
      vendorName: body.vendor?.name ?? row.vendorName,
    } : row));
    setToast(body.vendor?.name ? `Auto-assigned ${body.vendor.name}` : "Vendor auto-assigned");
  }

  async function saveSettings(next: { autoAssignAlwaysOn: boolean }) {
    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not save settings");
    const settings = parseOrgSettings(body.settings);
    setAutoAssignAlwaysOn(settings.autoAssignAlwaysOn);
    setJobAutoAssign((current) => {
      const nextMap = { ...current };
      for (const row of maintenance) {
        if (!row.vendorId && (row.status === "Diagnose" || row.status === "Authorize")) {
          nextMap[row.id] = settings.autoAssignAlwaysOn;
        }
      }
      return nextMap;
    });
    setToast(settings.autoAssignAlwaysOn ? "Auto-assign is always on" : "Auto-assign is opt-in per job");
  }

  async function saveOwnerRules(next: OwnerUI) {
    if (backendMode === "live") {
      const day = parseInt(next.disbursement) || 10;
      const r = await fetch(`/api/owners/${next.id}/rules`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maintenanceAuthority: next.auth, emergencyAuthority: next.emergency, minimumReserve: next.reserve, notifyOver: next.notifyOver, preferredVendor: next.preferred, disbursementDay: day }) });
      if (!r.ok) { setToast("Could not save owner rules"); return; }
    }
    setOwners(rows => rows.map(o => o.id === next.id ? next : o));
    setEditingOwner(null); setToast(backendMode === "live" ? "Owner rules saved" : "Demo rules updated locally");
  }

  async function createHome(payload: any) {
    if (backendMode !== "live") { setToast("Connect Supabase to persist new Home Passports"); setAddingHome(false); return; }
    const r = await fetch("/api/homes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await r.json();
    if (!r.ok) { setToast(body.error || "Could not create home"); return; }
    const o = owners.find(x => x.id === payload.ownerId);
    const newHome: HomeUI = { id: body.home.id, address: body.home.address1, city: `${body.home.city}, ${body.home.state}`, ownerId: body.home.owner_id, tenantId: "", type: body.home.property_type ?? "single_family", rent: (body.home.monthly_rent_cents ?? 0)/100, reserve: (body.home.reserve_balance_cents ?? 0)/100, health: body.home.health_status, leaseEnds: "", systems: [], access: body.home.access_notes ?? [] };
    setHomes(rows => [...rows, newHome]); setOwners(rows => rows.map(x => x.id === o?.id ? { ...x, homes: x.homes + 1 } : x)); setSelectedHome(newHome.id); setAddingHome(false); setTab("Homes"); setToast("Home Passport created");
  }

  return (
    <main className="shell">
      {toast && <div className="toast">{toast}</div>}
      <aside className="sidebar">
        <BrandLockup />
        <nav>
          {nav.map((item) => (
            <button key={item} className={tab === item ? "nav active" : "nav"} onClick={() => setTab(item)}>
              <BrandIcon name={navIcons[item]} className="navIcon" />
              {item}{item === "Today" && attention > 0 && <b>{attention}</b>}
            </button>
          ))}
        </nav>
        <a className="nav" href="/listings" style={{textDecoration:"none"}}><BrandIcon name="listing" className="navIcon" />Listings</a>
        <a className="nav" href="/payments" style={{textDecoration:"none"}}><BrandIcon name="rent" className="navIcon" />Payments</a>
        <a className="nav" href="/financials" style={{textDecoration:"none"}}><BrandIcon name="rent" className="navIcon" />Books</a>
        <a className="nav" href="/vendors" style={{textDecoration:"none"}}><BrandIcon name="applications" className="navIcon" />Approved Vendors</a>
        <ManagerSignOut className="nav" />
        <div className="portfolio"><small>PORTFOLIO</small><strong>{homes.length} homes</strong><span>{money(monthlyRent)} monthly rent</span><span className={`mode ${backendMode}`}>{backendMode === "live" ? "● Supabase live" : backendMode === "demo" ? "○ Demo mode" : backendMode === "auth" ? "Sign-in required" : backendMode === "checking" ? "Checking backend…" : "Backend unavailable"}</span></div>
      </aside>

      <section className="content">
        <header><div><p className="eyebrow">HOME OPERATIONS</p><h1>{tab === "Today" ? "Good evening." : tab}</h1></div><div className="headerActions">{backendMode === "auth" && <a className="secondaryBtn" href="/login">Sign in</a>}<button className="secondaryBtn" onClick={() => setSettingsOpen(true)}>Settings</button><button className="primary" onClick={() => setAddingHome(true)}>+ Add home</button></div></header>

        {backendMode === "auth" && <div className="backendBanner"><strong>Supabase is connected.</strong> Sign in to load your organization. The seeded UI remains visible underneath for product review.</div>}
        {backendMode === "demo" && <div className="backendBanner subtle"><strong>Demo mode.</strong> Add `.env.local` Supabase credentials to turn on persistence and authentication.</div>}
        {tab === "Today" && <Today maintenance={maintenance} onAdvance={nextStatus} onDispatch={setDispatching} onAuction={(item) => { if (openAuctions[item.id]) { setAuctioning(item); return; } void startAuction(item); }} onEndAuction={(item) => void endAuction(item)} collected={collected} rentSummary={rentSummary} homes={homes} tenants={tenants} jobAutoAssign={jobAutoAssign} onToggleAutoAssign={(id, value) => setJobAutoAssign((current) => ({ ...current, [id]: value }))} openAuctions={openAuctions} />}
        {tab === "Homes" && home && owner && <Homes homes={homes} selectedHome={selectedHome} setSelectedHome={setSelectedHome} home={home} owner={owner} tenant={tenant} onEditOwner={() => setEditingOwner(owner)} />}
        {tab === "Owners" && <Owners owners={owners} onEdit={setEditingOwner} />}
        {tab === "Tenants" && <Tenants tenants={tenants} onToast={setToast} />}
        {tab === "Maintenance" && <Maintenance rows={maintenance} homes={homes} onAdvance={nextStatus} onDispatch={setDispatching} onAuction={(item) => { if (openAuctions[item.id]) { setAuctioning(item); return; } void startAuction(item); }} onEndAuction={(item) => void endAuction(item)} jobAutoAssign={jobAutoAssign} onToggleAutoAssign={(id, value) => setJobAutoAssign((current) => ({ ...current, [id]: value }))} openAuctions={openAuctions} />}
      </section>
      {settingsOpen && <SettingsModal alwaysOn={autoAssignAlwaysOn} onClose={() => setSettingsOpen(false)} onSave={saveSettings} />}
      {editingOwner && <OwnerRulesModal owner={editingOwner} onClose={() => setEditingOwner(null)} onSave={saveOwnerRules} />}
      {addingHome && <AddHomeModal owners={owners} onClose={() => setAddingHome(false)} onCreate={createHome} live={backendMode === "live"} />}
      {auctioning && <AuctionBoard requestId={auctioning.id} title={auctioning.title} onClose={() => setAuctioning(null)} onAwarded={(vendor) => { setMaintenance((rows) => rows.map((row) => row.id === auctioning.id ? { ...row, status: "Dispatch", vendorId: vendor.id, vendorName: vendor.name } : row)); setOpenAuctions((current) => ({ ...current, [auctioning.id]: false })); setAuctioning(null); setToast(`Awarded to ${vendor.name}`); }} />}
      {dispatching&&<DispatchPicker request={dispatching} mode={backendMode} onClose={()=>setDispatching(null)} onAssigned={(vendor)=>{setMaintenance(rows=>rows.map(r=>r.id===dispatching.id?{...r,status:"Dispatch",vendorId:vendor.id,vendorName:vendor.name}:r));setDispatching(null);setToast("Eligible vendor assigned")}}/>}
      {closing&&<CloseWorkOrderModal request={closing} mode={backendMode} onClose={()=>setClosing(null)} onSave={async (performance)=>{const ok=await persistStatus(closing,"Documented",performance);if(ok){setClosing(null);setToast(closing.vendorName||closing.vendorId?"Work order documented with vendor performance":"Work order documented")}}}/>}
    </main>
  );
}

function Today({ maintenance, onAdvance,onDispatch,onAuction, onEndAuction, collected, rentSummary, homes, tenants, jobAutoAssign, onToggleAutoAssign, openAuctions }: { maintenance: MaintenanceUI[]; onAdvance: (id: string) => void;onDispatch:(m:MaintenanceUI)=>void; onAuction:(m:MaintenanceUI)=>void; onEndAuction:(m:MaintenanceUI)=>void; collected: number; rentSummary: { paidCount: number; dueCount: number; paidCents: number; dueCents: number } | null; homes: HomeUI[]; tenants: TenantUI[]; jobAutoAssign: Record<string, boolean>; onToggleAutoAssign: (id: string, value: boolean) => void; openAuctions: Record<string, boolean> }) {
  return <>
    <div className="stats">
      <Stat icon="maintenance" label="Needs attention" value={`${maintenance.filter(m => m.status !== "Documented").length}`} hint="Operational exceptions" tone="warn" />
      <Stat
        icon="rent"
        label="Rent collected"
        value={rentSummary ? `${rentSummary.paidCount}/${rentSummary.paidCount + rentSummary.dueCount}` : `${collected}/${tenants.length}`}
        hint={rentSummary
          ? `${money(rentSummary.paidCents / 100)} collected · Open payments`
          : `${money(homes.reduce((s,h)=>s+h.rent,0) - tenants.reduce((s,t)=>s+t.balance,0))} received · Open payments`}
        tone="good"
        href="/payments"
      />
      <Stat icon="listing" label="Portfolio health" value={`${Math.round((homes.filter(h=>h.health === "good").length / Math.max(homes.length,1))*100)}%`} hint={`${homes.filter(h=>h.health === "urgent").length} urgent • ${homes.filter(h=>h.health === "watch").length} watch`} tone="good" />
      <Stat icon="applications" label="Owner reserves" value={money(homes.reduce((s,h)=>s+h.reserve,0))} hint={`Across ${homes.length} homes`} tone="neutral" />
    </div>
    <section className="panel"><div className="panelHead"><div><p className="eyebrow">OPERATIONS INBOX</p><h2>What needs you</h2></div><span className="pill">Manage by exception</span></div><div className="taskList">{maintenance.length ? maintenance.map((m) => <Task key={m.id} item={m} homes={homes} onAdvance={onAdvance} onDispatch={onDispatch} onAuction={onAuction} onEndAuction={onEndAuction} autoAssign={Boolean(jobAutoAssign[m.id])} onToggleAutoAssign={onToggleAutoAssign} auctionOpen={Boolean(openAuctions[m.id])}/>) : <Empty text="No open maintenance requests." />}</div></section>
    <div className="twoCol"><section className="panel"><div className="panelHead"><div><p className="eyebrow">UPCOMING</p><h2>Next 90 days</h2></div></div><Timeline date="SEP 12" title="HVAC service" sub="487 Canyon View • Lennox ML180" /><Timeline date="OCT 18" title="Lease renewal" sub="487 Canyon View • Suggested rent $2,310" /><Timeline date="OCT 28" title="Sprinkler winterization" sub="3 homes due" /></section><section className="panel ownerDigest"><div className="panelHead"><div><p className="eyebrow">OWNER DIGEST</p><h2>Property health summary</h2></div><span className="health urgent">Exception</span></div><div className="ownerNumbers"><div><span>Open requests</span><strong>{maintenance.filter(m=>m.status!=="Documented").length}</strong></div><div><span>Urgent homes</span><strong>{homes.filter(h=>h.health==="urgent").length}</strong></div><div><span>Portfolio reserves</span><strong>{money(homes.reduce((s,h)=>s+h.reserve,0))}</strong></div></div><p className="summary">HomeOps converts each operational event into a permanent property record so owners see what happened, why it happened, and what required approval.</p></section></div>
  </>;
}

function Stat({ icon, label, value, hint, tone, href }: { icon: "listing" | "applications" | "rent" | "maintenance" | "tenants"; label: string; value: string; hint: string; tone: string; href?: string }) {
  const inner = <><BrandIcon name={icon} className="statIcon" title={label} /><span>{label}</span><div className={`statValue ${tone}`}>{value}</div><small>{hint}</small></>;
  return href ? <a className="stat statLink" href={href}>{inner}</a> : <div className="stat">{inner}</div>;
}
function Task({ item, homes, onAdvance, onDispatch, onAuction, onEndAuction, autoAssign, onToggleAutoAssign, auctionOpen }: { item: MaintenanceUI; homes: HomeUI[]; onAdvance: (id: string) => void; onDispatch: (m: MaintenanceUI) => void; onAuction: (m: MaintenanceUI) => void; onEndAuction: (m: MaintenanceUI) => void; autoAssign: boolean; onToggleAutoAssign: (id: string, value: boolean) => void; auctionOpen: boolean }) {
  const h = homes.find((x) => x.id === item.homeId);
  const assigned = Boolean(item.vendorId);
  const bidding = auctionOpen && !assigned && item.status === "Authorize";
  const statusLabel = bidding ? "Auction open" : assigned ? `${item.status} · ${item.vendorName}` : item.status;
  const primaryLabel = item.status === "Documented"
    ? "Complete"
    : bidding
      ? "End auction"
      : item.status === "Authorize"
        ? (autoAssign ? "Approve & auto-assign" : "Approve & start auction")
        : "Advance";
  return (
    <div className="task">
      <div className={`severity ${item.priority.toLowerCase()}`} />
      <div className="taskMain">
        <div className="taskTitle"><strong>{item.title}</strong><span className={`tag ${item.priority.toLowerCase()}`}>{item.priority}</span></div>
        <p>{h?.address ?? "Home"} • {item.tenant}</p>
        <small>{item.note}</small>
        {item.status === "Authorize" && !assigned && !bidding && (
          <label className="miniCheck">
            <input type="checkbox" checked={autoAssign} onChange={(e) => onToggleAutoAssign(item.id, e.target.checked)} />
            <span>Skip auction and auto-assign at this budget</span>
          </label>
        )}
      </div>
      <div className="taskAction">
        <span>{statusLabel}</span>
        {item.estimate > 0 && <strong>{money(item.estimate)}</strong>}
        {item.status === "Authorize" && !assigned && (
          <button onClick={() => onAuction(item)}>{bidding ? "View auction" : "Open auction"}</button>
        )}
        {item.status === "Dispatch" && !assigned && (
          <button onClick={() => onDispatch(item)}>Choose vendor</button>
        )}
        <button
          onClick={() => bidding ? onEndAuction(item) : onAdvance(item.id)}
          disabled={item.status === "Documented"}
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}
function Timeline({ date, title, sub }: { date: string; title: string; sub: string }) { return <div className="timeline"><div className="dateBox">{date}</div><div><strong>{title}</strong><p>{sub}</p></div></div>; }

function Homes({ homes, selectedHome, setSelectedHome, home, owner, tenant, onEditOwner }: { homes: HomeUI[]; selectedHome: string; setSelectedHome: (id:string)=>void; home: HomeUI; owner: OwnerUI; tenant?: TenantUI; onEditOwner: ()=>void }) {
  return <div className="homeLayout"><section className="panel homeList"><div className="panelHead"><div><p className="eyebrow">HOME PASSPORTS</p><h2>{homes.length} homes</h2></div></div>{homes.map((h) => <button key={h.id} className={selectedHome === h.id ? "homeRow selected" : "homeRow"} onClick={() => setSelectedHome(h.id)}><div><strong>{h.address}</strong><span>{h.city}</span></div><i className={`healthDot ${h.health}`} /></button>)}</section>
    <section className="panel passport"><div className="passportHero"><div><p className="eyebrow">HOME PASSPORT</p><h2>{home.address}</h2><p>{home.city}</p></div><span className={`health ${home.health}`}>{home.health}</span></div><div className="miniStats"><div><span>Owner</span><strong>{owner.name}</strong></div><div><span>Tenant</span><strong>{tenant?.name ?? "Vacant / unassigned"}</strong></div><div><span>Rent</span><strong>{money(home.rent)}</strong></div><div><span>Reserve</span><strong>{money(home.reserve)}</strong></div></div>
      <div className="sectionTitle"><h3>Systems & assets</h3><span>{home.systems.length} recorded</span></div>{home.systems.length ? <div className="systems">{home.systems.map((s) => <div className="system" key={`${s.name}-${s.detail}`}><div><strong>{s.name}</strong><p>{s.detail}</p></div><div><span>{s.age}</span><small>{s.next}</small></div></div>)}</div> : <Empty text="No systems recorded yet. Add HVAC, water heater, appliances, roof, and other durable assets here." />}
      <div className="sectionTitle"><h3>Operating rules</h3><button className="textBtn" onClick={onEditOwner}>Edit rules</button></div><div className="ruleGrid"><Rule k="Manager authority" v={money(owner.auth)} /><Rule k="Emergency authority" v={money(owner.emergency)} /><Rule k="Minimum reserve" v={money(owner.reserve)} /><Rule k="Preferred vendor" v={owner.preferred} /></div>
      <div className="sectionTitle"><h3>Rental listing</h3><a className="textBtn" href="/listings">Manage syndication</a></div><p className="summary">Draft the listing in HomeOps, then publish it to Zillow, Apartments.com, Rent.com, and other ILS feeds from the listings desk.</p><h3>Access & knowledge</h3>{home.access.length ? <ul className="access">{home.access.map((a) => <li key={a}>{a}</li>)}</ul> : <Empty text="No access notes recorded." />}</section></div>;
}

function Rule({ k, v }: { k: string; v: string }) { return <div className="rule"><span>{k}</span><strong>{v}</strong></div>; }
function Owners({ owners, onEdit }: { owners: OwnerUI[]; onEdit: (o:OwnerUI)=>void }) { return <section className="panel tablePanel"><div className="panelHead"><div><p className="eyebrow">CLIENTS + EXECUTABLE RULES</p><h2>Owners</h2></div></div><div className="table"><div className="tr head ownerTr"><span>Owner</span><span>Homes</span><span>Auth</span><span>Reserve</span><span>Preferred vendor</span><span>Action</span></div>{owners.map(o => <div className="tr ownerTr" key={o.id}><span><strong>{o.name}</strong><small>{o.email}</small></span><span>{o.homes}</span><span>{money(o.auth)}</span><span>{money(o.reserve)}</span><span>{o.preferred}</span><span><button className="textBtn" onClick={()=>onEdit(o)}>Edit rules</button> <a className="textBtn" href={`/owners?ownerId=${encodeURIComponent(o.id)}`} target="_blank" rel="noreferrer">Preview portal</a></span></div>)}</div></section>; }
function Tenants({ tenants, onToast }: { tenants: TenantUI[]; onToast: (m: string) => void }) {
  const [busy, setBusy] = useState("");
  async function sendPortalLink(t: TenantUI, channel: "email" | "sms") {
    setBusy(`${t.id}:${channel}`);
    const r = await fetch(`/api/tenants/${t.id}/portal-link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel }) });
    const body = await r.json().catch(() => ({}));
    setBusy("");
    if (!r.ok) { onToast(body.error || "Could not send the portal link"); return; }
    if (body.delivered) { onToast(`Portal link ${channel === "sms" ? "texted" : "emailed"} to ${body.sentTo}`); return; }
    if (body.url) {
      try { await navigator.clipboard.writeText(body.url); onToast(`${channel === "sms" ? "SMS" : "Email"} is not configured. Portal link copied to clipboard (valid 15 min).`); }
      catch { onToast(`Delivery not configured. Link: ${body.url}`); }
      return;
    }
    onToast(body.deliveryError || "Could not deliver the portal link");
  }
  return <section className="panel tablePanel"><div className="panelHead"><div><p className="eyebrow">TENANCY</p><h2>Tenants & leases</h2></div><div className="tenantsHeadActions"><span className="pill">Passwordless tenant portal</span><a className="secondaryBtn" href="/tenant/login" target="_blank" rel="noreferrer">Open portal sign-in</a></div></div><div className="table tenantTable"><div className="tr head"><span>Tenant</span><span>Home</span><span>Phone</span><span>Rent status</span><span>Portal</span></div>{tenants.map(t => <div className="tr" key={t.id}><span><strong>{t.name}</strong><small>{t.email}</small></span><span>{t.home}</span><span>{t.phone}</span><span><span className={t.balance ? "rent due" : "rent paid"}>{t.balance ? `${money(t.balance)} due` : "Paid"}</span></span><span className="payActions">{t.phone && <button className="textBtn" disabled={Boolean(busy)} onClick={() => void sendPortalLink(t, "sms")}>{busy === `${t.id}:sms` ? "Sending…" : "Text link"}</button>}{t.email && <button className="textBtn" disabled={Boolean(busy)} onClick={() => void sendPortalLink(t, "email")}>{busy === `${t.id}:email` ? "Sending…" : "Email link"}</button>}</span></div>)}</div></section>;
}
function Maintenance({ rows, homes, onAdvance, onDispatch, onAuction, onEndAuction, jobAutoAssign, onToggleAutoAssign, openAuctions }: { rows: MaintenanceUI[]; homes: HomeUI[]; onAdvance: (id: string) => void; onDispatch: (m: MaintenanceUI) => void; onAuction: (m: MaintenanceUI) => void; onEndAuction: (m: MaintenanceUI) => void; jobAutoAssign: Record<string, boolean>; onToggleAutoAssign: (id: string, value: boolean) => void; openAuctions: Record<string, boolean> }) {
  const flow = ["Diagnose", "Authorize", "Dispatch", "Scheduled", "Repair", "Invoice", "Documented"];
  return (
    <>
      <section className="panel">
        <div className="panelHead"><div><p className="eyebrow">FLAGSHIP WORKFLOW</p><h2>Maintenance command center</h2></div><span className="pill">Request → Documented</span></div>
        <div className="flow">{flow.map((s, i) => <div key={s}><b>{i + 1}</b><span>{s}</span></div>)}</div>
      </section>
      <section className="panel">
        <div className="taskList">{rows.map((r) => <Task key={r.id} item={r} homes={homes} onAdvance={onAdvance} onDispatch={onDispatch} onAuction={onAuction} onEndAuction={onEndAuction} autoAssign={Boolean(jobAutoAssign[r.id])} onToggleAutoAssign={onToggleAutoAssign} auctionOpen={Boolean(openAuctions[r.id])} />)}</div>
      </section>
    </>
  );
}

function DispatchPicker({request,mode,onClose,onAssigned}:{request:MaintenanceUI;mode:BackendMode;onClose:()=>void;onAssigned:(vendor:{id:string;name:string})=>void}){const [rows,setRows]=useState<any[]>([]);const [message,setMessage]=useState("Loading eligibility…");useEffect(()=>{fetch(`/api/maintenance/${request.id}/eligible-vendors`).then(async r=>({ok:r.ok,b:await r.json()})).then(({ok,b})=>{if(!ok){setMessage(b.error||"Could not load vendors");return}setRows(b.vendors||[]);setMessage("")}).catch(()=>setMessage("Could not load vendors"))},[request.id]);async function assign(v:any){if(mode!=="live"){setMessage("Demo mode previews eligibility; connect Supabase to assign.");return}const r=await fetch(`/api/maintenance/${request.id}/dispatch`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({vendorId:v.id})});const b=await r.json();if(!r.ok){setMessage((b.reasons||[b.error]).join(" • "));return}onAssigned({id:v.id,name:v.name})}return <div className="modalShade" onMouseDown={onClose}><section className="modal" onMouseDown={e=>e.stopPropagation()}><div className="modalHead"><div><p className="eyebrow">EXPLAINABLE DISPATCH</p><h2>Choose an eligible vendor</h2><p>{request.title}</p></div><button className="closeBtn" onClick={onClose}>×</button></div>{message&&<div className="notice">{message}</div>}<div className="credentialList">{rows.map(v=><div className="credential" key={v.id}><div><strong>{v.name}</strong><span>{v.eligibility.eligible?(v.eligibility.signals.join(" • ")||"Meets approval, credential, service and preference rules"):v.eligibility.reasons.join(" • ")}</span></div><button className={v.eligibility.eligible?"primary":"secondaryBtn"} disabled={!v.eligibility.eligible} onClick={()=>void assign(v)}>{v.eligibility.eligible?"Assign":"Ineligible"}</button></div>)}</div></section></div>}

function CloseWorkOrderModal({ request, mode, onClose, onSave }: { request: MaintenanceUI; mode: BackendMode; onClose: () => void; onSave: (performance: Record<string, unknown>) => Promise<void> }) {
  const [form, setForm] = useState({
    quotedAmount: request.estimate ? String(request.estimate) : "",
    invoicedAmount: "",
    callbackRequired: false,
    tenantRating: "",
    managerRating: "",
    documentationQuality: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<any>(null);
  const change = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };
  useEffect(() => {
    fetch(`/api/maintenance/${request.id}/job`)
      .then(async (r) => r.json())
      .then((body) => setJob(body.job || null))
      .catch(() => setJob(null));
  }, [request.id]);
  const timing = job?.timing;
  return (
    <div className="modalShade" onMouseDown={onClose}>
      <section className="modal vendorEditor" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <div>
            <p className="eyebrow">WORK ORDER CLOSE</p>
            <h2>{request.title}</h2>
            <p>{request.vendorName ? `Vendor: ${request.vendorName}` : "No vendor assigned — close without a performance event."}</p>
          </div>
          <button className="closeBtn" onClick={onClose}>×</button>
        </div>
        {mode !== "live" && <div className="notice">Demo mode records this locally. Connect Supabase to persist vendor performance.</div>}
        <p className="summary">Response and completion are calculated from system timestamps. Ratings stay optional and never change eligibility or organic ranking.</p>
        <div className="miniStats vendorMini">
          <div><span>Response</span><strong>{timing?.responseLabel || "Not recorded yet"}</strong></div>
          <div><span>Completion</span><strong>{timing?.completionLabel || "Not recorded yet"}</strong></div>
          <div><span>Arrived</span><strong>{job?.arrivedAt ? new Date(job.arrivedAt).toLocaleString() : "—"}</strong></div>
          <div><span>Left</span><strong>{job?.departedAt ? new Date(job.departedAt).toLocaleString() : timing?.onSite ? "On site" : "—"}</strong></div>
        </div>
        {timing && <p className="summary">{timing.responseDetail} {timing.completionDetail}</p>}
        {job?.fieldUrl && <p className="summary">Crew job link: <a href={job.fieldUrl} target="_blank" rel="noreferrer">{job.fieldUrl}</a></p>}
        {!!job?.logs?.length && (
          <div className="jobLogList">
            {job.logs.map((log: { id: string; kind: string; body?: string; createdAt: string }) => (
              <div key={log.id} className="jobLogRow">
                <strong>{log.kind}</strong>
                <span>{log.body || ""}</span>
                <small>{new Date(log.createdAt).toLocaleString()}</small>
              </div>
            ))}
          </div>
        )}
        <div className="formGrid">
          <label>Quoted amount ($)<input type="number" min="0" step="0.01" value={form.quotedAmount} onChange={change("quotedAmount")} /></label>
          <label>Invoiced amount ($)<input type="number" min="0" step="0.01" value={form.invoicedAmount} onChange={change("invoicedAmount")} /></label>
          <label>Callback / rework required<input type="checkbox" checked={form.callbackRequired} onChange={change("callbackRequired")} /></label>
          <label>Tenant rating (1–5)<input type="number" min="1" max="5" step="0.1" value={form.tenantRating} onChange={change("tenantRating")} /></label>
          <label>Manager rating (1–5)<input type="number" min="1" max="5" step="0.1" value={form.managerRating} onChange={change("managerRating")} /></label>
          <label>Documentation quality (1–5)<input type="number" min="1" max="5" step="0.1" value={form.documentationQuality} onChange={change("documentationQuality")} /></label>
          <label className="span2">Close-out notes<textarea value={form.notes} onChange={change("notes")} placeholder="Facts about the job, not a blended vendor score." /></label>
        </div>
        <div className="modalActions">
          <button className="secondaryBtn" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy} onClick={() => { setBusy(true); void onSave({
            quotedAmount: form.quotedAmount,
            invoicedAmount: form.invoicedAmount,
            callbackRequired: form.callbackRequired,
            tenantRating: form.tenantRating,
            managerRating: form.managerRating,
            documentationQuality: form.documentationQuality,
            notes: form.notes,
          }).finally(() => setBusy(false)); }}>{busy ? "Saving…" : "Document work order"}</button>
        </div>
      </section>
    </div>
  );
}

function OwnerRulesModal({ owner, onClose, onSave }: { owner: OwnerUI; onClose:()=>void; onSave:(o:OwnerUI)=>void }) {
  const [draft, setDraft] = useState(owner);
  const field = (key: keyof OwnerUI, n = false) => ({ value: String(draft[key] ?? ""), onChange: (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [key]: n ? Number(e.target.value) : e.target.value }) });
  return <div className="modalShade" onMouseDown={onClose}><section className="modal" onMouseDown={e=>e.stopPropagation()}><div className="modalHead"><div><p className="eyebrow">EXECUTABLE OWNER RULES</p><h2>{owner.name}</h2></div><button className="closeBtn" onClick={onClose}>×</button></div><div className="formGrid"><label>Manager authority ($)<input type="number" min="0" {...field("auth", true)} /></label><label>Emergency authority ($)<input type="number" min="0" {...field("emergency", true)} /></label><label>Minimum reserve ($)<input type="number" min="0" {...field("reserve", true)} /></label><label>Notify owner over ($)<input type="number" min="0" {...field("notifyOver", true)} /></label><label className="span2">Preferred vendor<input {...field("preferred")} /></label><label>Disbursement day<input value={parseInt(draft.disbursement)||10} onChange={e=>setDraft({...draft, disbursement:`${e.target.value}${ordinal(Number(e.target.value))} monthly`})} type="number" min="1" max="28" /></label></div><div className="modalActions"><button className="secondaryBtn" onClick={onClose}>Cancel</button><button className="primary" onClick={()=>onSave(draft)}>Save operating rules</button></div></section></div>;
}

function AddHomeModal({ owners, onClose, onCreate, live }: { owners:OwnerUI[]; onClose:()=>void; onCreate:(p:any)=>void; live:boolean }) {
  const [form, setForm] = useState({ ownerId: owners[0]?.id ?? "", address1:"", city:"", state:"UT", postalCode:"", latitude:"", longitude:"", monthlyRent:"", reserveBalance:"", healthStatus:"good" });
  const change = (k:string) => (e:React.ChangeEvent<HTMLInputElement|HTMLSelectElement>) => setForm({...form,[k]:e.target.value});
  return <div className="modalShade" onMouseDown={onClose}><section className="modal" onMouseDown={e=>e.stopPropagation()}><div className="modalHead"><div><p className="eyebrow">NEW HOME PASSPORT</p><h2>Add a rental home</h2></div><button className="closeBtn" onClick={onClose}>×</button></div>{!live && <div className="notice">Demo mode can preview the form, but persistence requires Supabase credentials.</div>}<div className="formGrid"><label className="span2">Owner<select value={form.ownerId} onChange={change("ownerId")}>{owners.map(o=><option value={o.id} key={o.id}>{o.name}</option>)}</select></label><label className="span2">Street address<input required value={form.address1} onChange={change("address1")} placeholder="1427 Maple Street" /></label><label>City<input value={form.city} onChange={change("city")} /></label><label>State<input value={form.state} onChange={change("state")} /></label><label>ZIP<input value={form.postalCode} onChange={change("postalCode")} /></label><label>Latitude (optional)<input type="number" step="any" value={form.latitude} onChange={change("latitude")} /></label><label>Longitude (optional)<input type="number" step="any" value={form.longitude} onChange={change("longitude")} /></label><label>Monthly rent ($)<input type="number" value={form.monthlyRent} onChange={change("monthlyRent")} /></label><label>Reserve balance ($)<input type="number" value={form.reserveBalance} onChange={change("reserveBalance")} /></label><label>Health<select value={form.healthStatus} onChange={change("healthStatus")}><option value="good">Good</option><option value="watch">Watch</option><option value="urgent">Urgent</option></select></label></div><div className="modalActions"><button className="secondaryBtn" onClick={onClose}>Cancel</button><button className="primary" onClick={()=>onCreate(form)} disabled={!form.address1 || !form.city || !form.ownerId}>Create Home Passport</button></div></section></div>;
}
function Empty({ text }:{text:string}) { return <div className="empty">{text}</div>; }
function capitalize(v:string){ return v ? v.charAt(0).toUpperCase()+v.slice(1) : v; }
function ordinal(day:number){ if(day>=11&&day<=13)return"th"; const n=day%10; return n===1?"st":n===2?"nd":n===3?"rd":"th"; }
