"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { VendorApprovalStatus, VendorWorkflowStage } from "@/lib/vendors";
import { isNetworkAdmin, managerVisibleStatuses } from "@/lib/vendors";
import BrandLockup from "@/components/brand-lockup";
import BrandIcon from "@/components/brand-icon";
import RecruitmentBoard from "./recruitment-board";
import VendorBiddingPanel from "@/components/vendor-bidding-panel";

type VendorRow = {
  id: string;
  name: string;
  trade?: string | null;
  city?: string | null;
  state?: string | null;
  workflow_stage: VendorWorkflowStage;
  approval_status: VendorApprovalStatus;
  emergency_available?: boolean;
  expected_response_minutes?: number | null;
  minimum_trip_charge_cents?: number | null;
  hourly_rate_cents?: number | null;
  services?: string[];
  vendor_services?: Array<{
    specialty?: string | null;
    service_categories?: { name?: string } | null;
  }>;
  credentials?: Array<{ name: string; status: string; expires_on: string }>;
  vendor_credentials?: Array<{
    name: string;
    verification_status: string;
    expires_on?: string | null;
  }>;
  email?: string | null;
  phone?: string | null;
  performance?: {
    jobs: number;
    avgResponse: number;
    callbackRate: number;
    managerRating: number | null;
  };
  vendor_performance_events?: Array<any>;
  vendor_contacts?: Array<any>;
  vendor_service_areas?: Array<any>;
  vendor_documents?: Array<any>;
  vendor_owner_preferences?: Array<any>;
  vendor_property_preferences?: Array<any>;
};

const money = (c?: number | null) =>
  c == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(c / 100);
const stageLabel = (s: string) =>
  s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const stages: VendorWorkflowStage[] = [
  "candidate",
  "invited",
  "application_submitted",
  "documents_reviewed",
  "approved",
  "monitored",
  "renewal_required",
  "suspended",
];

export default function VendorsPage() {
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [mode, setMode] = useState("checking");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [editing, setEditing] = useState<VendorRow | null | undefined>(
    undefined,
  );
  const [role, setRole] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>({
    categories: [],
    owners: [],
    homes: [],
  });
  const networkAdmin = isNetworkAdmin(role);

  const load = useCallback(async () => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    const r = await fetch("/api/vendors?" + p.toString());
    const body = await r.json();
    if (!r.ok) {
      setMode(r.status === 401 ? "auth" : "error");
      return;
    }
    setMode(body.mode);
    setRole(body.role ?? (body.mode === "demo" ? "manager" : null));
    const rows = (body.vendors ?? []) as VendorRow[];
    const admin = isNetworkAdmin(body.role ?? (body.mode === "demo" ? "manager" : null));
    const visible = admin ? rows : rows.filter((v) => managerVisibleStatuses.includes(v.approval_status));
    setVendors(visible);
    setMeta(body.meta ?? { categories: [], owners: [], homes: [] });
    if (!selected && visible[0]) setSelected(visible[0].id);
  }, [q, status, selected]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const vendor = vendors.find((v) => v.id === selected) ?? vendors[0];
  const stats = useMemo(
    () => ({
      approved: vendors.filter((v) =>
        ["approved", "preferred"].includes(v.approval_status),
      ).length,
      conditional: vendors.filter((v) => v.approval_status === "conditional")
        .length,
      renewal: vendors.filter((v) =>
        ["renewal_required", "suspended"].includes(v.workflow_stage),
      ).length,
      emergency: vendors.filter((v) => v.emergency_available).length,
    }),
    [vendors],
  );

  async function moveStage(next: VendorWorkflowStage) {
    if (!vendor) return;
    if (mode === "demo") {
      setVendors((rows) =>
        rows.map((v) =>
          v.id === vendor.id ? { ...v, workflow_stage: next } : v,
        ),
      );
      setToast("Demo workflow updated locally");
      return;
    }
    const r = await fetch(`/api/vendors/${vendor.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflowStage: next,
        approvalStatus:
          next === "approved" ? "approved" : vendor.approval_status,
        reason: "Updated from Vendor Network workspace",
      }),
    });
    const body = await r.json();
    if (!r.ok) {
      setToast(body.error || "Could not update vendor");
      return;
    }
    setVendors((rows) =>
      rows.map((v) => (v.id === vendor.id ? { ...v, ...body.vendor } : v)),
    );
    setToast("Vendor workflow updated");
  }

  const services = vendor
    ? (vendor.services ??
      vendor.vendor_services
        ?.map((s) => s.specialty || s.service_categories?.name || "Service")
        .filter(Boolean) ??
      [])
    : [];
  const creds = vendor
    ? (vendor.credentials ??
      vendor.vendor_credentials?.map((c) => ({
        name: c.name,
        status: c.verification_status,
        expires_on: c.expires_on ?? "",
      })) ??
      [])
    : [];

  return (
    <main className="vendorShell">
      {toast && <div className="toast">{toast}</div>}
      <aside className="finSide">
        <BrandLockup href="/" className="finBrand" />
        <nav>
          <a className="finNav" href="/">
            <BrandIcon name="listing" className="navIcon" />
            Operations
          </a>
          <a className="finNav" href="/listings">
            <BrandIcon name="listing" className="navIcon" />
            Listings
          </a>
          <a className="finNav" href="/payments">
            <BrandIcon name="rent" className="navIcon" />
            Payments
          </a>
          <a className="finNav" href="/financials">
            <BrandIcon name="rent" className="navIcon" />
            Books
          </a>
          <a className="finNav active" href="/vendors">
            <BrandIcon name="applications" className="navIcon" />
            Approved Vendors
          </a>
        </nav>
        <div className="portfolio">
          <small>VENDOR NETWORK</small>
          <strong>{vendors.length} records</strong>
          <span>{stats.approved} approved / preferred</span>
          <span className={"mode " + mode}>
            {mode === "live"
              ? "● Supabase live"
              : mode === "demo"
                ? "○ Demo mode"
                : "Checking…"}
          </span>
        </div>
      </aside>
      <section className="vendorContent">
        <header className="finHeader">
          <div>
            <p className="eyebrow">{networkAdmin ? "APPROVED VENDOR NETWORK" : "APPROVED VENDORS"}</p>
            <h1>{networkAdmin ? "Trusted vendors, before marketplace growth." : "Who can take the work."}</h1>
            <p>
              {networkAdmin
                ? "Approve, monitor, and route work using structured vendor records, verified credentials, coverage, owner rules, and operational history."
                : "Dispatch-ready shops with coverage, credentials, rates, and job history. Network approval and vendor autobid setup stay with the network admin."}
            </p>
          </div>
          {networkAdmin && (
            <button
              className="primary vendorAdd"
              onClick={() => setEditing(null)}
            >
              + Candidate vendor
            </button>
          )}
        </header>
        <div className="stats finStats">
          <Stat label="Approved / preferred" value={stats.approved} />
          {networkAdmin ? (
            <>
              <Stat label="Conditional" value={stats.conditional} />
              <Stat label="Renewal attention" value={stats.renewal} />
            </>
          ) : (
            <Stat label="On this list" value={vendors.length} />
          )}
          <Stat label="Emergency capable" value={stats.emergency} />
        </div>

        {networkAdmin && <RecruitmentBoard />}

        {networkAdmin && (
        <section className="panel">
          <div className="panelHead">
            <div>
              <p className="eyebrow">APPROVAL WORKFLOW</p>
              <h2>Candidate → monitored</h2>
            </div>
            <span className="pill">Credential-gated</span>
          </div>
          <div className="vendorFlow">
            {stages.map((s, i) => (
              <button
                key={s}
                className={vendor?.workflow_stage === s ? "active" : ""}
                onClick={() => void moveStage(s)}
                disabled={!vendor}
              >
                <b>{i + 1}</b>
                <span>{stageLabel(s)}</span>
              </button>
            ))}
          </div>
        </section>
        )}

        <div className="vendorLayout" id="directory">
          <section className="panel vendorListPanel">
            <div className="panelHead">
              <div>
                <p className="eyebrow">DIRECTORY</p>
                <h2>{vendors.length} vendors</h2>
              </div>
            </div>
            <div className="vendorFilters">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search trade, city, vendor…"
              />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="preferred">Preferred</option>
                <option value="approved">Approved</option>
                <option value="conditional">Conditional</option>
                {networkAdmin && <option value="suspended">Suspended</option>}
                {networkAdmin && <option value="blocked">Blocked</option>}
              </select>
            </div>
            {vendors.map((v) => (
              <button
                className={
                  vendor?.id === v.id ? "vendorRow selected" : "vendorRow"
                }
                key={v.id}
                onClick={() => setSelected(v.id)}
              >
                <div>
                  <strong>{v.name}</strong>
                  <span>
                    {v.trade || "General vendor"} •{" "}
                    {[v.city, v.state].filter(Boolean).join(", ") ||
                      "Service area not set"}
                  </span>
                </div>
                <span className={"vendorStatus " + v.approval_status}>
                  {v.approval_status}
                </span>
              </button>
            ))}
          </section>

          <section className="panel vendorDetail">
            {!vendor ? (
              <div className="empty">No vendors match these filters.</div>
            ) : (
              <>
                <div className="passportHero">
                  <div>
                    <p className="eyebrow">VENDOR RECORD</p>
                    <h2>{vendor.name}</h2>
                    <p>
                      {vendor.trade || "General vendor"} •{" "}
                      {[vendor.city, vendor.state].filter(Boolean).join(", ")}
                    </p>
                  </div>
                  <div>
                    <span className={"vendorStatus " + vendor.approval_status}>
                      {vendor.approval_status}
                    </span>{" "}
                    {networkAdmin && (
                      <button
                        className="textBtn"
                        onClick={() => setEditing(vendor)}
                      >
                        Edit & manage
                      </button>
                    )}
                  </div>
                </div>
                <div className="miniStats vendorMini">
                  {networkAdmin ? (
                    <div>
                      <span>Workflow</span>
                      <strong>{stageLabel(vendor.workflow_stage)}</strong>
                    </div>
                  ) : (
                    <div>
                      <span>Contact</span>
                      <strong>{vendor.phone || vendor.email || vendor.vendor_contacts?.[0]?.phone || vendor.vendor_contacts?.[0]?.email || "On file in dispatch"}</strong>
                    </div>
                  )}
                  <div>
                    <span>Emergency</span>
                    <strong>
                      {vendor.emergency_available
                        ? "Available"
                        : "Standard hours"}
                    </strong>
                  </div>
                  <div>
                    <span>Expected response</span>
                    <strong>
                      {vendor.expected_response_minutes
                        ? vendor.expected_response_minutes + " min"
                        : "—"}
                    </strong>
                  </div>
                  <div>
                    <span>Trip / hourly</span>
                    <strong>
                      {money(vendor.minimum_trip_charge_cents)} /{" "}
                      {money(vendor.hourly_rate_cents)}
                    </strong>
                  </div>
                </div>

                <div className="sectionTitle">
                  <h3>Services & specialties</h3>
                  <span>{services.length} listed</span>
                </div>
                <div className="chipRow">
                  {services.length ? (
                    services.map((s) => (
                      <span className="serviceChip" key={s}>
                        {s}
                      </span>
                    ))
                  ) : (
                    <div className="empty">No services recorded.</div>
                  )}
                </div>
                <div className="sectionTitle">
                  <h3>Credentials</h3>
                  <span>Expiration affects eligibility</span>
                </div>
                <div className="credentialList">
                  {creds.length ? (
                    creds.map((c) => (
                      <div className="credential" key={c.name}>
                        <div>
                          <strong>{c.name}</strong>
                          <span>
                            {c.expires_on
                              ? "Expires " + c.expires_on
                              : "No expiration recorded"}
                          </span>
                        </div>
                        <span className={"cred " + c.status}>{c.status}</span>
                      </div>
                    ))
                  ) : (
                    <div className="empty">
                      {networkAdmin
                        ? "No credentials recorded. Approval should remain conditional until required documents are reviewed."
                        : "No credentials recorded for this vendor."}
                    </div>
                  )}
                </div>
                <div className="sectionTitle">
                  <h3>Performance scorecard</h3>
                  <span>Objective ≠ subjective</span>
                </div>
                <Scorecard vendor={vendor} />
                {networkAdmin && <VendorBiddingPanel vendorId={vendor.id} />}
                {networkAdmin && (
                <div className="notice">
                  <strong>Ranking integrity:</strong> performance cannot be
                  purchased. Future sponsored placement must remain visually
                  separate and never change this scorecard or organic
                  qualification.
                </div>
                )}
              </>
            )}
          </section>
        </div>
      </section>
      {networkAdmin && editing !== undefined && (
        <VendorEditor
          vendor={editing}
          mode={mode}
          meta={meta}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void load();
          }}
          notify={setToast}
        />
      )}
    </main>
  );
}

function VendorEditor({
  vendor,
  mode,
  meta,
  onClose,
  onSaved,
  notify,
}: {
  vendor: VendorRow | null;
  mode: string;
  meta: any;
  onClose: () => void;
  onSaved: () => void;
  notify: (s: string) => void;
}) {
  const [form, setForm] = useState<any>({
    name: vendor?.name ?? "",
    trade: vendor?.trade ?? "",
    email: (vendor as any)?.email ?? "",
    phone: (vendor as any)?.phone ?? "",
    website: (vendor as any)?.website ?? "",
    city: vendor?.city ?? "",
    state: vendor?.state ?? "",
    postalCode: (vendor as any)?.postal_code ?? "",
    emergencyAvailable: vendor?.emergency_available ?? false,
    afterHoursAvailable: (vendor as any)?.after_hours_available ?? false,
    expectedResponseMinutes: vendor?.expected_response_minutes ?? "",
    privateNotes: (vendor as any)?.private_notes ?? "",
  });
  const [resource, setResource] = useState("contacts");
  const [quick, setQuick] = useState<any>({});
  const [file, setFile] = useState<File | null>(null);
  const change =
    (k: string) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm({
        ...form,
        [k]:
          e.target.type === "checkbox"
            ? (e.target as HTMLInputElement).checked
            : e.target.value,
      });
  async function save() {
    if (mode !== "live") {
      notify("Connect and sign in to persist vendor changes");
      return;
    }
    const r = await fetch(
      vendor ? `/api/vendors/${vendor.id}` : "/api/vendors",
      {
        method: vendor ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      },
    );
    const b = await r.json();
    if (!r.ok) {
      notify(b.error || "Could not save vendor");
      return;
    }
    notify(vendor ? "Vendor updated" : "Candidate vendor created");
    onSaved();
  }
  async function add() {
    if (!vendor || mode !== "live") return;
    let fields: any = {};
    if (resource === "contacts")
      fields = {
        full_name: quick.name,
        contact_type: quick.type || "contact",
        email: quick.email || null,
        phone: quick.phone || null,
      };
    if (resource === "services")
      fields = {
        service_category_id: quick.category,
        specialty: quick.specialty || null,
        active: true,
      };
    if (resource === "areas")
      fields = {
        area_type: quick.areaType || "postal_code",
        postal_code: quick.areaType === "postal_code" ? quick.postalCode : null,
        city: quick.areaType === "city" ? quick.city : null,
        state: ["city", "state"].includes(quick.areaType) ? quick.state : null,
        center_lat: quick.areaType === "radius" ? Number(quick.latitude) : null,
        center_lng: quick.areaType === "radius" ? Number(quick.longitude) : null,
        radius_miles: quick.areaType === "radius" ? Number(quick.radiusMiles) : null,
        coverageGeoJson: quick.areaType === "polygon" ? quick.coverageGeoJson : null,
      };
    if (resource === "credentials")
      fields = {
        credential_type: quick.type || "other",
        name: quick.name,
        expires_on: quick.expires || null,
        verification_status: "pending",
      };
    if (resource === "ownerPreferences")
      fields = {
        owner_id: quick.owner,
        preference: quick.preference || "preferred",
        priority: 0,
      };
    if (resource === "propertyPreferences")
      fields = {
        home_id: quick.home,
        preference: quick.preference || "preferred",
        priority: 0,
      };
    const r = await fetch(`/api/vendors/${vendor.id}/resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource, ...fields }),
    });
    const b = await r.json();
    if (!r.ok) {
      notify(b.error || "Could not add item");
      return;
    }
    setQuick({});
    notify("Vendor detail added");
    onSaved();
  }
  async function upload() {
    if (!vendor || !file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("documentType", quick.documentType || "other");
    const r = await fetch(`/api/vendors/${vendor.id}/documents`, {
      method: "POST",
      body: fd,
    });
    const b = await r.json();
    if (!r.ok) {
      notify(b.error || "Upload failed");
      return;
    }
    notify(b.scanQueued ? "Document quarantined; malware scan queued" : "Document quarantined; scanner needs configuration");
    onSaved();
  }
  async function verifyCredential(credentialId: string) {
    if (!vendor || mode !== "live") return;
    const r = await fetch(`/api/vendors/${vendor.id}/credentials/${credentialId}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const b = await r.json();
    notify(r.ok ? (b.queued ? "External credential verification queued" : "Verification provider needs configuration") : b.error || "Could not queue verification");
  }
  async function downloadDocument(documentId: string) {
    if (!vendor) return;
    const r = await fetch(`/api/vendors/${vendor.id}/documents?documentId=${documentId}`);
    const b = await r.json();
    if (!r.ok) { notify(b.error || "Document unavailable"); return; }
    window.open(b.url, "_blank", "noopener,noreferrer");
  }
  return (
    <div className="modalShade" onMouseDown={onClose}>
      <section
        className="modal vendorEditor"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modalHead">
          <div>
            <p className="eyebrow">
              {vendor ? "VENDOR PASSPORT" : "NEW CANDIDATE"}
            </p>
            <h2>{vendor?.name || "Create vendor"}</h2>
          </div>
          <button className="closeBtn" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="formGrid">
          <label className="span2">
            Vendor name
            <input value={form.name} onChange={change("name")} />
          </label>
          <label>
            Trade
            <input value={form.trade} onChange={change("trade")} />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={change("email")} />
          </label>
          <label>
            Phone
            <input value={form.phone} onChange={change("phone")} />
          </label>
          <label>
            Website
            <input value={form.website} onChange={change("website")} />
          </label>
          <label>
            City
            <input value={form.city} onChange={change("city")} />
          </label>
          <label>
            State
            <input value={form.state} onChange={change("state")} />
          </label>
          <label>
            ZIP
            <input value={form.postalCode} onChange={change("postalCode")} />
          </label>
          <label>
            Response minutes
            <input
              type="number"
              value={form.expectedResponseMinutes}
              onChange={change("expectedResponseMinutes")}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.emergencyAvailable}
              onChange={change("emergencyAvailable")}
            />{" "}
            Emergency available
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.afterHoursAvailable}
              onChange={change("afterHoursAvailable")}
            />{" "}
            After-hours available
          </label>
          <label className="span2">
            Private organization notes
            <textarea
              value={form.privateNotes}
              onChange={change("privateNotes")}
            />
          </label>
        </div>
        {vendor && (
          <>
            <div className="sectionTitle">
              <h3>Structured details</h3>
              <span>Contacts, coverage, credentials & preferences</span>
            </div>
            <div className="formGrid">
              <label>
                Detail type
                <select
                  value={resource}
                  onChange={(e) => {
                    setResource(e.target.value);
                    setQuick({});
                  }}
                >
                  <option value="contacts">Contact</option>
                  <option value="services">Service / specialty</option>
                  <option value="areas">Service area</option>
                  <option value="credentials">Credential</option>
                  <option value="ownerPreferences">Owner preference</option>
                  <option value="propertyPreferences">
                    Property preference
                  </option>
                </select>
              </label>
              {resource === "contacts" && (
                <>
                  <label>
                    Name
                    <input
                      value={quick.name || ""}
                      onChange={(e) =>
                        setQuick({ ...quick, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Email
                    <input
                      value={quick.email || ""}
                      onChange={(e) =>
                        setQuick({ ...quick, email: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Phone
                    <input
                      value={quick.phone || ""}
                      onChange={(e) =>
                        setQuick({ ...quick, phone: e.target.value })
                      }
                    />
                  </label>
                </>
              )}
              {resource === "services" && (
                <>
                  <label>
                    Category
                    <select
                      value={quick.category || ""}
                      onChange={(e) =>
                        setQuick({ ...quick, category: e.target.value })
                      }
                    >
                      <option value="">Select</option>
                      {meta.categories.map((x: any) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Specialty
                    <input
                      value={quick.specialty || ""}
                      onChange={(e) =>
                        setQuick({ ...quick, specialty: e.target.value })
                      }
                    />
                  </label>
                </>
              )}
              {resource === "areas" && (
                <>
                  <label>Coverage type<select value={quick.areaType || "postal_code"} onChange={(e)=>setQuick({...quick,areaType:e.target.value})}><option value="postal_code">Postal code</option><option value="city">City</option><option value="state">State</option><option value="radius">Radius</option><option value="polygon">GeoJSON polygon</option></select></label>
                  {(quick.areaType || "postal_code") === "postal_code" && <label>Postal code<input value={quick.postalCode || ""} onChange={(e)=>setQuick({...quick,postalCode:e.target.value})}/></label>}
                  {quick.areaType === "city" && <><label>City<input value={quick.city || ""} onChange={(e)=>setQuick({...quick,city:e.target.value})}/></label><label>State<input value={quick.state || ""} onChange={(e)=>setQuick({...quick,state:e.target.value})}/></label></>}
                  {quick.areaType === "state" && <label>State<input value={quick.state || ""} onChange={(e)=>setQuick({...quick,state:e.target.value})}/></label>}
                  {quick.areaType === "radius" && <><label>Center latitude<input type="number" step="any" value={quick.latitude || ""} onChange={(e)=>setQuick({...quick,latitude:e.target.value})}/></label><label>Center longitude<input type="number" step="any" value={quick.longitude || ""} onChange={(e)=>setQuick({...quick,longitude:e.target.value})}/></label><label>Radius miles<input type="number" min="0" value={quick.radiusMiles || ""} onChange={(e)=>setQuick({...quick,radiusMiles:e.target.value})}/></label></>}
                  {quick.areaType === "polygon" && <label className="span2">Polygon or MultiPolygon GeoJSON<textarea value={quick.coverageGeoJson || ""} onChange={(e)=>setQuick({...quick,coverageGeoJson:e.target.value})} placeholder='{"type":"Polygon","coordinates":[[[-111.9,40.7],...]]}'/></label>}
                </>
              )}
              {resource === "credentials" && (
                <>
                  <label>
                    Credential name
                    <input
                      value={quick.name || ""}
                      onChange={(e) =>
                        setQuick({ ...quick, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Type
                    <select
                      value={quick.type || "other"}
                      onChange={(e) =>
                        setQuick({ ...quick, type: e.target.value })
                      }
                    >
                      <option value="license">License</option>
                      <option value="insurance_general_liability">
                        General liability
                      </option>
                      <option value="insurance_workers_comp">
                        Workers comp
                      </option>
                      <option value="certification">Certification</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label>
                    Expires
                    <input
                      type="date"
                      value={quick.expires || ""}
                      onChange={(e) =>
                        setQuick({ ...quick, expires: e.target.value })
                      }
                    />
                  </label>
                </>
              )}
              {resource === "ownerPreferences" && (
                <label>
                  Owner
                  <select
                    value={quick.owner || ""}
                    onChange={(e) =>
                      setQuick({ ...quick, owner: e.target.value })
                    }
                  >
                    <option value="">Select</option>
                    {meta.owners.map((x: any) => (
                      <option key={x.id} value={x.id}>
                        {x.full_name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {resource === "propertyPreferences" && (
                <label>
                  Property
                  <select
                    value={quick.home || ""}
                    onChange={(e) =>
                      setQuick({ ...quick, home: e.target.value })
                    }
                  >
                    <option value="">Select</option>
                    {meta.homes.map((x: any) => (
                      <option key={x.id} value={x.id}>
                        {x.address1}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {resource.includes("Preferences") && (
                <label>
                  Preference
                  <select
                    value={quick.preference || "preferred"}
                    onChange={(e) =>
                      setQuick({ ...quick, preference: e.target.value })
                    }
                  >
                    <option>preferred</option>
                    <option>allowed</option>
                    <option>avoid</option>
                    <option>blocked</option>
                  </select>
                </label>
              )}
              <button className="secondaryBtn" onClick={() => void add()}>
                Add detail
              </button>
            </div>
            <div className="sectionTitle">
              <h3>Private documents</h3>
              <span>Quarantine + malware scan • 60-second downloads</span>
            </div>
            <div className="formGrid">
              <label>
                Document type
                <select
                  value={quick.documentType || "other"}
                  onChange={(e) =>
                    setQuick({ ...quick, documentType: e.target.value })
                  }
                >
                  <option value="w9">W-9 (sensitive)</option>
                  <option value="insurance">Insurance</option>
                  <option value="license">License</option>
                  <option value="certification">Certification</option>
                  <option value="contract">Contract</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="span2">
                File
                <input
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
              <button
                className="secondaryBtn"
                disabled={!file}
                onClick={() => void upload()}
              >
                Upload privately
              </button>
            </div>
            <div className="credentialList">
              {(vendor.vendor_credentials ?? []).map((c:any)=><div className="credential" key={c.id}><div><strong>{c.name}</strong><span>{c.verification_status} • {c.expires_on ? `expires ${c.expires_on}` : "no expiry"}</span></div><button className="secondaryBtn" onClick={()=>void verifyCredential(c.id)}>Verify externally</button></div>)}
              {(vendor.vendor_documents ?? []).map((d:any)=><div className="credential" key={d.id}><div><strong>{d.file_name}</strong><span>{d.document_type} • scan: {d.scan_status || "migration required"}</span></div><button className="secondaryBtn" disabled={d.scan_status !== "clean"} onClick={()=>void downloadDocument(d.id)}>Download</button></div>)}
            </div>
          </>
        )}
        <div className="modalActions">
          <button className="secondaryBtn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={!form.name}
            onClick={() => void save()}
          >
            Save vendor
          </button>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <div className="statValue">{value}</div>
      <small>Current filtered directory</small>
    </div>
  );
}
function Scorecard({ vendor }: { vendor: VendorRow }) {
  const p = vendor.performance;
  const events = vendor.vendor_performance_events ?? [];
  const jobs = p?.jobs ?? events.length;
  const response =
    p?.avgResponse ??
    (events.length
      ? Math.round(
          events.reduce((s, e) => s + (e.response_minutes || 0), 0) /
            events.filter((e) => e.response_minutes != null).length,
        )
      : null);
  const callback =
    p?.callbackRate ??
    (events.length
      ? events.filter((e) => e.callback_required).length / events.length
      : null);
  const rating =
    p?.managerRating ??
    (events.filter((e) => e.manager_rating != null).length
      ? events
          .filter((e) => e.manager_rating != null)
          .reduce((s, e) => s + e.manager_rating, 0) /
        events.filter((e) => e.manager_rating != null).length
      : null);
  return (
    <div className="scoreGrid">
      <div>
        <span>Completed sample</span>
        <strong>{jobs} jobs</strong>
        <small>
          {jobs < 5
            ? "Too little history for strong conclusions"
            : "Operational sample available"}
        </small>
      </div>
      <div>
        <span>Avg response</span>
        <strong>{response != null ? response + " min" : "—"}</strong>
        <small>Objective metric</small>
      </div>
      <div>
        <span>Callback rate</span>
        <strong>
          {callback != null ? Math.round(callback * 100) + "%" : "—"}
        </strong>
        <small>Objective metric</small>
      </div>
      <div>
        <span>Manager rating</span>
        <strong>
          {rating != null && jobs >= 3
            ? rating.toFixed(1) + "/5"
            : "Insufficient sample"}
        </strong>
        <small>Subjective • minimum 3</small>
      </div>
    </div>
  );
}
