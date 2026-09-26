"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import BrandLockup from "@/components/brand-lockup";
import ManagerSignOut from "@/components/manager-sign-out";
import BrandIcon from "@/components/brand-icon";
import { moneyCents } from "@/lib/rent";

type Charge = {
  id: string;
  tenantName: string;
  address: string;
  kind: string;
  dueOn: string;
  amountCents: number;
  paidCents: number;
  remainingCents: number;
  status: string;
  payUrl: string;
  notes?: string | null;
};

const statusLabel: Record<string, string> = {
  due: "Due",
  processing: "Processing",
  paid: "Paid",
  failed: "Failed",
  partial: "Partial",
  void: "Void",
};

export default function PaymentsPage() {
  const [mode, setMode] = useState("checking");
  const [stripe, setStripe] = useState(false);
  const [summary, setSummary] = useState({ dueCents: 0, paidCents: 0, dueCount: 0, paidCount: 0 });
  const [period, setPeriod] = useState("");
  const [charges, setCharges] = useState<Charge[]>([]);
  const [homes, setHomes] = useState<Array<{ id: string; address: string; tenantId?: string; rent?: number }>>([]);
  const [tenants, setTenants] = useState<Array<{ id: string; name: string }>>([]);
  const [filter, setFilter] = useState<"due" | "paid" | "all">("due");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [form, setForm] = useState({ tenantId: "", homeId: "", amount: "", kind: "rent", notes: "" });

  async function load() {
    const response = await fetch("/api/rent/charges");
    const body = await response.json();
    if (response.status === 401) { setMode("auth"); return; }
    if (!response.ok) { setMode("error"); setMessage(body.error || "Could not load payments"); return; }
    setMode(body.mode);
    setStripe(Boolean(body.stripe));
    setSummary(body.summary);
    setPeriod(body.period?.label || "");
    setCharges(body.charges || []);
    setHomes(body.homes || []);
    setTenants(body.tenants || []);
    if (!form.tenantId && body.tenants?.[0]) setForm((current) => ({ ...current, tenantId: body.tenants[0].id, homeId: body.homes?.[0]?.id || current.homeId }));
  }

  useEffect(() => { void load(); }, []);

  const visible = useMemo(() => {
    if (filter === "all") return charges;
    if (filter === "paid") return charges.filter((row) => row.status === "paid");
    return charges.filter((row) => row.status !== "paid" && row.status !== "void");
  }, [charges, filter]);

  async function copyLink(url: string) {
    await navigator.clipboard.writeText(url);
    setMessage("Pay link copied. Tenants can open it without a HomeOps login.");
  }

  async function generate() {
    setBusy("generate");
    const response = await fetch("/api/rent/charges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generate: true }) });
    const body = await response.json();
    setBusy("");
    if (!response.ok) { setMessage(body.error || "Could not generate charges"); return; }
    setMessage(body.message || `Generated ${body.created ?? "current-month"} rent charges.`);
    await load();
  }

  async function offline(id: string) {
    setBusy(id);
    const response = await fetch(`/api/rent/charges/${id}/offline`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method: "cash" }) });
    const body = await response.json();
    setBusy("");
    if (!response.ok) { setMessage(body.error || "Could not record payment"); return; }
    setMessage("Cash/check recorded in HomeOps and posted to Books.");
    await load();
  }

  async function createCharge(event: FormEvent) {
    event.preventDefault();
    setBusy("create");
    const response = await fetch("/api/rent/charges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await response.json();
    setBusy("");
    if (!response.ok) { setMessage(body.error || "Could not create charge"); return; }
    setForm((current) => ({ ...current, amount: "", notes: "" }));
    setMessage("Charge created. Copy the pay link for the tenant.");
    await load();
  }

  return (
    <main className="finShell">
      <aside className="finSide">
        <BrandLockup href="/" className="finBrand" />
        <nav>
          <a className="finNav" href="/"><BrandIcon name="listing" className="navIcon" />Operations</a>
          <a className="finNav" href="/listings"><BrandIcon name="listing" className="navIcon" />Listings</a>
          <a className="finNav active" href="/payments"><BrandIcon name="rent" className="navIcon" />Payments</a>
          <a className="finNav" href="/financials"><BrandIcon name="rent" className="navIcon" />Books</a>
          <a className="finNav" href="/vendors"><BrandIcon name="applications" className="navIcon" />Approved Vendors</a>
          <ManagerSignOut className="finNav" />
        </nav>
        <div className="portfolio">
          <small>COLLECTION</small>
          <strong>{summary.dueCount} due</strong>
          <span>{moneyCents(summary.dueCents)} outstanding</span>
          <span className={`mode ${mode}`}>{stripe ? "● Stripe connected" : "○ Demo pay / no Stripe key"}</span>
        </div>
      </aside>
      <section className="finContent">
        <header className="finHeader">
          <div>
            <p className="eyebrow">RENT COLLECTION</p>
            <h1>{period || "This month"}</h1>
            <p>Charges live in HomeOps. Stripe only processes the card or ACH. Paid rent posts into Books.</p>
          </div>
          <div className="headerActions">
            {mode === "auth" && <a className="secondaryBtn" href="/login">Sign in</a>}
            <button className="secondaryBtn" disabled={Boolean(busy)} onClick={() => void generate()}>Generate this month</button>
          </div>
        </header>
        {message && <div className="backendBanner">{message}</div>}
        <div className="stats finStats">
          <div className="stat"><span>Outstanding</span><div className={`statValue ${summary.dueCents ? "warn" : "good"}`}>{moneyCents(summary.dueCents)}</div><small>{summary.dueCount} open charges</small></div>
          <div className="stat"><span>Collected this board</span><div className="statValue good">{moneyCents(summary.paidCents)}</div><small>{summary.paidCount} paid in full</small></div>
          <div className="stat"><span>Processor</span><div className="statValue">{stripe ? "Stripe" : "Demo"}</div><small>Pay page stays in HomeOps</small></div>
        </div>
        <div className="intelTabs">
          {(["due", "paid", "all"] as const).map((key) => (
            <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{key === "due" ? "To collect" : key === "paid" ? "Paid" : "All charges"}</button>
          ))}
        </div>
        <div className="panel">
          <div className="finTable payTable">
            <div className="finTr finHead"><span>Tenant / home</span><span>Due</span><span>Amount</span><span>Status</span><span>Collect</span></div>
            {visible.map((row) => (
              <div className="finTr" key={row.id}>
                <span><strong>{row.tenantName}</strong><small>{row.address} · {row.kind.replace("_", " ")}</small></span>
                <span>{new Date(`${row.dueOn}T12:00:00`).toLocaleDateString()}</span>
                <span>{moneyCents(row.remainingCents || row.amountCents)}{row.paidCents ? <small> of {moneyCents(row.amountCents)}</small> : null}</span>
                <span><b className={`confidence ${row.status === "paid" ? "high" : row.status === "failed" ? "low" : "medium"}`}>{statusLabel[row.status] || row.status}</b></span>
                <span className="payActions">
                  <button className="textBtn" onClick={() => void copyLink(row.payUrl)}>Copy pay link</button>
                  <a className="textBtn" href={row.payUrl} target="_blank" rel="noreferrer">Open</a>
                  {row.status !== "paid" && <button className="textBtn" disabled={busy === row.id} onClick={() => void offline(row.id)}>{busy === row.id ? "Saving…" : "Record cash"}</button>}
                </span>
              </div>
            ))}
            {!visible.length && <div className="empty">No charges in this view. Generate this month or add a charge below.</div>}
          </div>
        </div>
        <div className="panel">
          <div className="panelHead"><div><p className="eyebrow">NEW CHARGE</p><h2>Create a collection item</h2></div></div>
          <form className="formGrid" onSubmit={createCharge}>
            <label>Tenant
              <select value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })}>
                {tenants.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </label>
            <label>Home
              <select value={form.homeId} onChange={(e) => setForm({ ...form, homeId: e.target.value })}>
                {homes.map((row) => <option key={row.id} value={row.id}>{row.address}</option>)}
              </select>
            </label>
            <label>Kind
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                <option value="rent">Rent</option>
                <option value="late_fee">Late fee</option>
                <option value="deposit">Deposit</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>Amount ($)<input required type="number" min="1" step="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
            <label className="span2">Notes<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional. Do not paste bank account numbers here." /></label>
            <div className="span2"><button className="primary" disabled={busy === "create"} type="submit">{busy === "create" ? "Saving…" : "Create charge"}</button></div>
          </form>
        </div>
      </section>
    </main>
  );
}
