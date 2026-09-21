"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import BrandLockup from "@/components/brand-lockup";
import BrandIcon from "@/components/brand-icon";
import { BILL_KINDS, BOOK_KINDS, buildOwnerStatements, buildTenantLedgers, type BookEntry, type BooksHome, type BooksOwner, type VendorBill } from "@/lib/books";
import { moneyCents } from "@/lib/rent";
import { buildPortfolioIntelligence, type IntelligenceHome as Home, type IntelligenceTransaction as Tx } from "@/lib/portfolio-intelligence";

type View = "owners" | "doors" | "bills" | "tenants" | "insights" | "migrate";
type InsightView = "overview" | "properties" | "services" | "trends" | "review";
type Charge = {
  id: string;
  tenantId: string;
  tenantName: string;
  address: string;
  kind: string;
  dueOn: string;
  amountCents: number;
  paidCents: number;
  remainingCents: number;
  status: string;
  payUrl: string;
};

const money = (c: number) => moneyCents(c);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const monthLabel = (m: string) => new Date(`${m}-02T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "2-digit" });

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (q && text[i + 1] === '"') { cell += '"'; i++; }
      else q = !q;
    } else if (ch === "," && !q) { row.push(cell); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !q) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = (rows.shift() || []).map((x) => x.trim());
  return { headers, rows: rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))) };
}

function BooksNav() {
  return (
    <nav>
      <a className="finNav" href="/"><BrandIcon name="listing" className="navIcon" />Operations</a>
      <a className="finNav" href="/listings"><BrandIcon name="listing" className="navIcon" />Listings</a>
      <a className="finNav" href="/payments"><BrandIcon name="rent" className="navIcon" />Payments</a>
      <a className="finNav active" href="/financials"><BrandIcon name="rent" className="navIcon" />Books</a>
      <a className="finNav" href="/vendors"><BrandIcon name="applications" className="navIcon" />Approved Vendors</a>
    </nav>
  );
}

export default function BooksPage() {
  const [mode, setMode] = useState("checking");
  const [homes, setHomes] = useState<BooksHome[]>([]);
  const [owners, setOwners] = useState<BooksOwner[]>([]);
  const [tenants, setTenants] = useState<Array<{ id: string; name: string; home?: string; email?: string }>>([]);
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([]);
  const [entries, setEntries] = useState<BookEntry[]>([]);
  const [bills, setBills] = useState<VendorBill[]>([]);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [tx, setTx] = useState<Tx[]>([]);
  const [period, setPeriod] = useState(currentMonth());
  const [view, setView] = useState<View>("owners");
  const [insightView, setInsightView] = useState<InsightView>("overview");
  const [selectedHome, setSelectedHome] = useState("");
  const [selectedOwner, setSelectedOwner] = useState("");
  const [filter, setFilter] = useState<"all" | "review" | "matched" | "overhead">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [billForm, setBillForm] = useState({ vendorName: "", homeId: "", kind: "repairs", amount: "", description: "", payNow: false });
  const [moveForm, setMoveForm] = useState({ ownerId: "", kind: "owner_disbursement", amount: "", notes: "" });
  const [showImport, setShowImport] = useState(false);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({ date: "", description: "", vendor: "", amount: "", debit: "", credit: "", account: "", qbClass: "", qbLocation: "", customerProject: "", memo: "", positiveMeans: "expense" });

  async function load() {
    const r = await fetch("/api/financial/bootstrap");
    const b = await r.json();
    if (r.status === 401) { setMode("auth"); return; }
    if (!r.ok) { setMode("error"); setMsg(b.error || "Could not load books"); return; }
    setMode(b.mode);
    setHomes(b.homes || []);
    setOwners(b.owners || []);
    setTenants(b.tenants || []);
    setVendors(b.vendors || []);
    setEntries(b.entries || []);
    setBills(b.bills || []);
    setCharges(b.charges || []);
    setTx(b.transactions || []);
    setSelectedHome((x) => x || b.homes?.[0]?.id || "");
    setSelectedOwner((x) => x || b.owners?.[0]?.id || "");
    setMoveForm((current) => ({ ...current, ownerId: current.ownerId || b.owners?.[0]?.id || "" }));
    if (b.period?.periodStart) setPeriod((current) => current || b.period.periodStart.slice(0, 7));
  }

  useEffect(() => { void load(); }, []);

  const range = useMemo(() => monthRange(period), [period]);
  const statements = useMemo(
    () => buildOwnerStatements({ owners, homes, entries, periodStart: range.start, periodEnd: range.end }),
    [owners, homes, entries, range],
  );
  const tenantLedgers = useMemo(
    () => buildTenantLedgers({ charges, entries }),
    [charges, entries],
  );
  const intelHomes: Home[] = homes.map((home) => ({ id: home.id, address1: home.address1, city: home.city, state: home.state, property_code: home.property_code }));
  const periodTx = useMemo(() => tx.filter((row) => row.tx_date >= range.start && row.tx_date <= range.end), [tx, range]);
  const intel = useMemo(() => buildPortfolioIntelligence(intelHomes, periodTx), [intelHomes, periodTx]);
  const property = intel.properties.find((x) => x.home.id === selectedHome) || intel.properties[0];
  const maxMonth = Math.max(1, ...intel.months.flatMap((m) => [m.revenue, m.expenses]));
  const visibleTx = filter === "all" ? tx : tx.filter((t) => t.allocation_status === filter);
  const openBills = bills.filter((row) => row.status === "open");
  const statement = statements.find((row) => row.owner.id === selectedOwner) || statements[0];
  const dueToOwners = statements.reduce((sum, row) => sum + row.dueToOwner, 0);

  async function createBill(event: FormEvent) {
    event.preventDefault();
    setBusy("bill");
    const response = await fetch("/api/financial/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...billForm, homeId: billForm.homeId || null }),
    });
    const body = await response.json();
    setBusy("");
    if (!response.ok) { setMsg(body.error || "Could not save bill"); return; }
    setMsg(billForm.payNow ? "Bill recorded and posted to the door." : "Bill saved. Mark it paid when cash leaves the account.");
    setBillForm((current) => ({ ...current, amount: "", description: "" }));
    await load();
  }

  async function payBill(id: string) {
    setBusy(id);
    const response = await fetch(`/api/financial/bills/${id}/pay`, { method: "POST" });
    const body = await response.json();
    setBusy("");
    if (!response.ok) { setMsg(body.error || "Could not mark bill paid"); return; }
    setMsg("Bill paid and posted to the books. This is not a bank payout.");
    await load();
  }

  async function ownerMove(event: FormEvent) {
    event.preventDefault();
    setBusy("move");
    const response = await fetch("/api/financial/owner-moves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(moveForm),
    });
    const body = await response.json();
    setBusy("");
    if (!response.ok) { setMsg(body.error || "Could not record owner cash"); return; }
    setMsg(moveForm.kind === "owner_contribution" ? "Owner contribution recorded." : "Disbursement recorded. Money movement still happens at the bank.");
    setMoveForm((current) => ({ ...current, amount: "", notes: "" }));
    await load();
  }

  async function assign(id: string, propertyId: string | null, overhead = false) {
    if (mode !== "live") {
      setTx((xs) => xs.map((t) => t.id === id ? { ...t, allocation_status: overhead ? "overhead" : propertyId ? "matched" : "review", property_id: propertyId, homes: intelHomes.find((h) => h.id === propertyId) || null, match_confidence: propertyId || overhead ? 1 : 0 } : t));
      return;
    }
    const r = await fetch(`/api/financial/transactions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(overhead ? { markOverhead: true } : { propertyId }) });
    if (r.ok) {
      const b = await r.json();
      setTx((xs) => xs.map((t) => t.id === id ? b.transaction : t));
    }
  }

  async function bulk(propertyId?: string, overhead = false) {
    if (!selected.length) return;
    if (mode !== "live") {
      for (const id of selected) await assign(id, propertyId || null, overhead);
      setSelected([]);
      return;
    }
    setBusy("bulk");
    const r = await fetch("/api/financial/bulk-review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selected, propertyId, markOverhead: overhead }) });
    setBusy("");
    if (r.ok) { setSelected([]); await load(); }
  }

  function chooseFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    file.text().then((text) => {
      const p = parseCsv(text);
      setHeaders(p.headers);
      setRows(p.rows);
      const find = (...ns: string[]) => p.headers.find((h) => ns.some((n) => h.toLowerCase().includes(n))) || "";
      setMapping((m) => ({ ...m, date: find("date"), description: find("description", "name"), vendor: find("vendor", "payee"), amount: find("amount"), debit: find("debit"), credit: find("credit"), account: find("account"), qbClass: find("class"), qbLocation: find("location"), customerProject: find("customer", "project"), memo: find("memo") }));
    });
  }

  async function importRows() {
    if (!mapping.date || (!mapping.amount && !mapping.debit && !mapping.credit)) { setMsg("Map a date and either amount or debit/credit columns first."); return; }
    if (mode !== "live") { setMsg("Import mapping is ready. Connect Supabase to persist a historical QuickBooks export. HomeOps is already the live books."); return; }
    setBusy("import");
    const r = await fetch("/api/financial/imports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName, mapping, rows }) });
    const b = await r.json();
    setBusy("");
    if (!r.ok) { setMsg(b.error || "Import failed"); return; }
    setMsg(`Imported ${b.total} historical rows: ${b.matched} auto-matched, ${b.review} need review.`);
    setShowImport(false);
    await load();
  }

  const tabs: { id: View; label: string }[] = [
    { id: "owners", label: "Owner money" },
    { id: "doors", label: "Doors" },
    { id: "bills", label: `Bills${openBills.length ? ` (${openBills.length})` : ""}` },
    { id: "tenants", label: "Tenants" },
    { id: "insights", label: "Insights" },
    { id: "migrate", label: "Bring in old books" },
  ];

  return (
    <main className="finShell">
      <aside className="finSide">
        <BrandLockup href="/" className="finBrand" />
        <BooksNav />
        <div className="portfolio">
          <small>PROPERTY BOOKS</small>
          <strong>{homes.length} doors</strong>
          <span>{money(dueToOwners)} due to owners this period</span>
          <span className={`mode ${mode}`}>{mode === "live" ? "● Live HomeOps books" : mode === "demo" ? "○ Demo books" : `Backend status: ${mode}`}</span>
        </div>
      </aside>
      <section className="finContent">
        <header className="finHeader">
          <div>
            <p className="eyebrow">BOOKS</p>
            <h1>Cash by door, owner, and tenant</h1>
            <p>HomeOps is the books. Rent posts when it is collected. Bills post when you mark them paid. Owner draws are recorded here; the bank still moves the money.</p>
          </div>
          <div className="headerActions">
            <label className="periodSelectLabel">Period
              <input className="periodSelect" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </label>
            {mode === "auth" && <a className="secondaryBtn" href="/login">Sign in</a>}
          </div>
        </header>
        {msg && <div className="backendBanner">{msg}</div>}
        <div className="intelTabs">
          {tabs.map((tab) => (
            <button key={tab.id} className={view === tab.id ? "active" : ""} onClick={() => setView(tab.id)}>{tab.label}</button>
          ))}
        </div>

        {view === "owners" && statement && (
          <>
            <div className="stats finStats">
              <div className="stat"><span>Cash in</span><div className="statValue good">{money(statements.reduce((s, row) => s + row.income, 0))}</div><small>Rent and tenant fees</small></div>
              <div className="stat"><span>Operating out</span><div className="statValue">{money(statements.reduce((s, row) => s + row.operating, 0))}</div></div>
              <div className="stat"><span>Due to owners</span><div className={`statValue ${dueToOwners ? "good" : ""}`}>{money(dueToOwners)}</div><small>After capex and draws already recorded</small></div>
              <div className="stat"><span>Open bills</span><div className={`statValue ${openBills.length ? "warn" : "good"}`}>{openBills.length}</div><small>{money(openBills.reduce((s, row) => s + row.amountCents, 0))} not yet posted</small></div>
            </div>
            <div className="propertyPicker">
              <div><p className="eyebrow">OWNER STATEMENT</p><h2>{statement.owner.name}</h2></div>
              <select value={statement.owner.id} onChange={(e) => setSelectedOwner(e.target.value)}>
                {statements.map((row) => <option key={row.owner.id} value={row.owner.id}>{row.owner.name}</option>)}
              </select>
            </div>
            <div className="stats finStats">
              <div className="stat"><span>NOI</span><div className={`statValue ${statement.noi >= 0 ? "good" : "warn"}`}>{money(statement.noi)}</div></div>
              <div className="stat"><span>Capex</span><div className="statValue">{money(statement.capital)}</div></div>
              <div className="stat"><span>Already sent</span><div className="statValue">{money(statement.disbursed)}</div></div>
              <div className="stat"><span>Due this period</span><div className={`statValue ${statement.belowReserve ? "warn" : "good"}`}>{money(statement.dueToOwner)}</div><small>{statement.belowReserve ? `Below ${money(statement.reserveFloor)} reserve floor` : `Reserve floor ${money(statement.reserveFloor)}`}</small></div>
            </div>
            <div className="intelGrid">
              <div className="panel">
                <PanelTitle eyebrow="DOORS" title={`What ${statement.owner.name} owns`} />
                <div className="compactLedger">
                  {statement.doors.map((home) => {
                    const income = statement.rows.filter((row) => row.homeId === home.id && row.flowType === "income").reduce((s, row) => s + row.amountCents, 0);
                    const expense = statement.rows.filter((row) => row.homeId === home.id && row.flowType === "expense" && row.kind !== "capital").reduce((s, row) => s + row.amountCents, 0);
                    return (
                      <div key={home.id}>
                        <span><strong>{home.address1}</strong><small>{money(income)} in · {money(expense)} operating</small></span>
                        <b className={income - expense >= 0 ? "income" : "expense"}>{money(income - expense)}</b>
                      </div>
                    );
                  })}
                  {!statement.doors.length && <div className="empty">No doors assigned to this owner.</div>}
                </div>
              </div>
              <div className="panel">
                <PanelTitle eyebrow="RECORD" title="Owner cash" />
                <form className="formGrid" onSubmit={ownerMove}>
                  <label>Owner
                    <select value={moveForm.ownerId} onChange={(e) => setMoveForm({ ...moveForm, ownerId: e.target.value })}>
                      {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                    </select>
                  </label>
                  <label>Type
                    <select value={moveForm.kind} onChange={(e) => setMoveForm({ ...moveForm, kind: e.target.value })}>
                      <option value="owner_disbursement">Disbursement to owner</option>
                      <option value="owner_contribution">Owner contribution in</option>
                    </select>
                  </label>
                  <label>Amount ($)<input required type="number" min="1" step="1" value={moveForm.amount} onChange={(e) => setMoveForm({ ...moveForm, amount: e.target.value })} /></label>
                  <label>Notes<input value={moveForm.notes} onChange={(e) => setMoveForm({ ...moveForm, notes: e.target.value })} placeholder="Optional memo. Not a bank transfer." /></label>
                  <div className="span2"><button className="primary" disabled={busy === "move"} type="submit">{busy === "move" ? "Saving…" : "Record on the books"}</button></div>
                </form>
              </div>
            </div>
          </>
        )}

        {view === "doors" && property && (
          <>
            <div className="propertyPicker">
              <div><p className="eyebrow">DOOR P&L</p><h2>Cash result by home</h2></div>
              <select value={property.home.id} onChange={(e) => setSelectedHome(e.target.value)}>
                {intel.properties.map((x) => <option key={x.home.id} value={x.home.id}>{x.home.address1}</option>)}
              </select>
            </div>
            <div className="stats finStats">
              <div className="stat"><span>Revenue</span><div className="statValue good">{money(property.revenue)}</div></div>
              <div className="stat"><span>Operating</span><div className="statValue">{money(property.operatingExpenses)}</div></div>
              <div className="stat"><span>NOI</span><div className={`statValue ${property.noi >= 0 ? "good" : "warn"}`}>{money(property.noi)}</div></div>
              <div className="stat"><span>Capex</span><div className="statValue">{money(property.capitalExpenses)}</div></div>
            </div>
            <div className="intelGrid">
              <div className="panel">
                <PanelTitle eyebrow="PROFIT & LOSS" title={property.home.address1} aside={<span className={`health ${property.noi >= 0 ? "good" : "urgent"}`}>{property.noi >= 0 ? "Cash positive" : "Operating loss"}</span>} />
                <div className="pnl">
                  <div><span>Rent and tenant fees</span><strong>{money(property.revenue)}</strong></div>
                  {[...new Set(property.rows.filter((r) => r.flow_type === "expense").map((r) => r.account_name || "Uncategorized"))].map((cat) => {
                    const spend = property.rows.filter((r) => r.flow_type === "expense" && (r.account_name || "Uncategorized") === cat).reduce((s, r) => s + r.amount_cents, 0);
                    return <div key={cat}><span>{cat}</span><strong>−{money(spend)}</strong></div>;
                  })}
                  <div className="total"><span>Net operating income</span><strong>{money(property.noi)}</strong></div>
                </div>
              </div>
              <div className="panel">
                <PanelTitle eyebrow="LEDGER" title="Posted this period" aside={<span className="pill">{property.rows.length} rows</span>} />
                <div className="compactLedger">
                  {property.rows.toSorted((a, b) => b.tx_date.localeCompare(a.tx_date)).map((r) => (
                    <div key={r.id}>
                      <span><strong>{r.vendor_name || r.description || "Entry"}</strong><small>{r.tx_date} · {r.account_name}</small></span>
                      <b className={r.flow_type}>{r.flow_type === "income" ? "+" : "−"}{money(r.amount_cents)}</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="panel"><PanelTitle eyebrow="PORTFOLIO" title="All doors" /><PropertyTable properties={intel.properties} onSelect={setSelectedHome} /></div>
          </>
        )}

        {view === "bills" && (
          <>
            <div className="panel">
              <div className="finTable payTable">
                <div className="finTr finHead"><span>Vendor / door</span><span>Due</span><span>Amount</span><span>Status</span><span></span></div>
                {bills.map((bill) => (
                  <div className="finTr" key={bill.id}>
                    <span><strong>{bill.vendorName}</strong><small>{homes.find((home) => home.id === bill.homeId)?.address1 || "Company overhead"} · {BOOK_KINDS[bill.kind].label}</small></span>
                    <span>{new Date(`${bill.dueOn}T12:00:00`).toLocaleDateString()}</span>
                    <span>{money(bill.amountCents)}</span>
                    <span><b className={`confidence ${bill.status === "paid" ? "high" : bill.status === "open" ? "medium" : "low"}`}>{bill.status}</b></span>
                    <span>{bill.status === "open" && <button className="textBtn" disabled={busy === bill.id} onClick={() => void payBill(bill.id)}>{busy === bill.id ? "Posting…" : "Mark paid"}</button>}</span>
                  </div>
                ))}
                {!bills.length && <div className="empty">No bills yet. Add a vendor invoice below.</div>}
              </div>
            </div>
            <div className="panel">
              <PanelTitle eyebrow="NEW BILL" title="Assign spend to a door" />
              <form className="formGrid" onSubmit={createBill}>
                <label>Vendor
                  <input list="book-vendors" required value={billForm.vendorName} onChange={(e) => setBillForm({ ...billForm, vendorName: e.target.value })} />
                  <datalist id="book-vendors">{vendors.map((row) => <option key={row.id} value={row.name} />)}</datalist>
                </label>
                <label>Door
                  <select value={billForm.homeId} onChange={(e) => setBillForm({ ...billForm, homeId: e.target.value })}>
                    <option value="">Company overhead</option>
                    {homes.map((home) => <option key={home.id} value={home.id}>{home.address1}</option>)}
                  </select>
                </label>
                <label>Category
                  <select value={billForm.kind} onChange={(e) => setBillForm({ ...billForm, kind: e.target.value })}>
                    {BILL_KINDS.map((kind) => <option key={kind} value={kind}>{BOOK_KINDS[kind].label}</option>)}
                  </select>
                </label>
                <label>Amount ($)<input required type="number" min="1" step="1" value={billForm.amount} onChange={(e) => setBillForm({ ...billForm, amount: e.target.value })} /></label>
                <label className="span2">What was this<input value={billForm.description} onChange={(e) => setBillForm({ ...billForm, description: e.target.value })} placeholder="Invoice memo" /></label>
                <label className="span2"><input type="checkbox" name="payNow" checked={billForm.payNow} onChange={(e) => setBillForm({ ...billForm, payNow: e.target.checked })} /> Already paid — post to the books now</label>
                <div className="span2"><button className="primary" disabled={busy === "bill"} type="submit">{busy === "bill" ? "Saving…" : "Save bill"}</button></div>
              </form>
            </div>
          </>
        )}

        {view === "tenants" && (
          <div className="panel">
            <PanelTitle eyebrow="TENANT LEDGERS" title="What each tenant owes" aside={<a className="textBtn" href="/payments">Open payments →</a>} />
            <div className="finTable payTable">
              <div className="finTr finHead"><span>Tenant</span><span>Charged</span><span>Paid</span><span>Still due</span><span>Deposits held</span></div>
              {tenantLedgers.map((row) => (
                <div className="finTr" key={row.tenantId}>
                  <span><strong>{row.name}</strong><small>{row.address}</small></span>
                  <span>{money(row.charged)}</span>
                  <span>{money(row.paid)}</span>
                  <span><b className={`confidence ${row.remaining ? "medium" : "high"}`}>{money(row.remaining)}</b></span>
                  <span>{money(row.depositsHeld)}</span>
                </div>
              ))}
              {!tenantLedgers.length && <div className="empty">No rent charges yet. Generate this month from Payments.</div>}
            </div>
            <div className="finTable payTable" style={{ marginTop: 24 }}>
              <div className="finTr finHead"><span>Charge</span><span>Due</span><span>Charged</span><span>Paid</span><span>Status</span></div>
              {charges.map((row) => (
                <div className="finTr" key={row.id}>
                  <span><strong>{row.tenantName}</strong><small>{row.address} · {row.kind.replace("_", " ")}</small></span>
                  <span>{new Date(`${row.dueOn}T12:00:00`).toLocaleDateString()}</span>
                  <span>{money(row.amountCents)}</span>
                  <span>{money(row.paidCents)}</span>
                  <span><a className="textBtn" href={row.payUrl} target="_blank" rel="noreferrer">{row.status === "paid" ? "Receipt" : "Collect"}</a></span>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "insights" && (
          <>
            <div className="intelTabs">
              {([
                ["overview", "Overview"],
                ["properties", "Property P&L"],
                ["services", "Vendors"],
                ["trends", "Trends"],
                ["review", `Review${intel.review ? ` (${intel.review})` : ""}`],
              ] as const).map(([id, label]) => (
                <button key={id} className={insightView === id ? "active" : ""} onClick={() => setInsightView(id)}>{label}</button>
              ))}
            </div>
            {insightView === "overview" && (
              <>
                <MetricCards intel={intel} />
                <div className="intelGrid">
                  <div className="panel"><PanelTitle eyebrow="ACTION CENTER" title="What needs attention" /><InsightList insights={intel.insights} /></div>
                  <div className="panel"><PanelTitle eyebrow="COST MIX" title="Expense by type" /><div className="barList">{intel.categories.slice(0, 6).map((c) => <div className="barRow" key={c.name}><div><strong>{c.name}</strong><span>{c.transactions} · {c.properties} doors</span></div><div className="barTrack"><i style={{ width: `${Math.max(3, c.share * 100)}%` }} /></div><b>{money(c.spend)}</b></div>)}</div></div>
                </div>
                <div className="panel"><PanelTitle eyebrow="DOOR RANKING" title="Property profitability" /><PropertyTable properties={intel.properties} onSelect={(id) => { setSelectedHome(id); setView("doors"); }} /></div>
              </>
            )}
            {insightView === "properties" && property && (
              <div className="panel"><PropertyTable properties={intel.properties} onSelect={setSelectedHome} /></div>
            )}
            {insightView === "services" && (
              <div className="intelGrid">
                <div className="panel"><PanelTitle eyebrow="SPEND" title="Where the portfolio spends" /><div className="serviceTable"><div className="serviceTr head"><span>Type</span><span>Class</span><span>Spend</span><span>Avg</span><span>Doors</span></div>{intel.categories.map((c) => <div className="serviceTr" key={c.name}><span><strong>{c.name}</strong></span><span><b className={`costClass ${c.expenseClass.toLowerCase()}`}>{c.expenseClass}</b></span><span>{money(c.spend)}</span><span>{money(c.averageInvoice)}</span><span>{c.properties}</span></div>)}</div></div>
                <div className="panel"><PanelTitle eyebrow="VENDORS" title="Concentration" /><div className="vendorCards">{intel.vendors.map((v) => <div className="vendorCard" key={v.name}><div><strong>{v.name}</strong><span>{v.categories.join(" · ")}</span></div><b>{money(v.spend)}</b></div>)}</div></div>
              </div>
            )}
            {insightView === "trends" && (
              <div className="panel">
                <PanelTitle eyebrow="MONTHLY" title="Revenue, expenses, NOI" />
                <div className="trendChart">{intel.months.map((m) => <div className="trendMonth" key={m.month}><div className="trendBars"><i className="revenueBar" style={{ height: `${Math.max(3, m.revenue / maxMonth * 100)}%` }} /><i className="expenseBar" style={{ height: `${Math.max(3, m.expenses / maxMonth * 100)}%` }} /></div><strong>{monthLabel(m.month)}</strong><span className={m.noi >= 0 ? "goodText" : "badText"}>{money(m.noi)}</span></div>)}</div>
              </div>
            )}
            {insightView === "review" && (
              <div className="panel">
                <div className="panelHead"><div><p className="eyebrow">IMPORTED ROWS</p><h2>Assign leftover QuickBooks lines</h2></div><div className="finFilters">{(["all", "review", "matched", "overhead"] as const).map((f) => <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>{f}</button>)}</div></div>
                {selected.length > 0 && (
                  <div className="bulkBar">
                    <strong>{selected.length} selected</strong>
                    <select defaultValue="" onChange={(e) => { if (e.target.value) bulk(e.target.value); }}><option value="">Assign to door…</option>{homes.map((h) => <option key={h.id} value={h.id}>{h.address1}</option>)}</select>
                    <button onClick={() => bulk(undefined, true)} disabled={Boolean(busy)}>Mark overhead</button>
                  </div>
                )}
                <div className="finTable">
                  <div className="finTr finHead"><span /><span>Date / vendor</span><span>Account</span><span>Amount</span><span>Door</span><span>Confidence</span></div>
                  {visibleTx.map((t) => (
                    <div className="finTr" key={t.id}>
                      <span><input type="checkbox" checked={selected.includes(t.id)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, t.id] : s.filter((x) => x !== t.id))} /></span>
                      <span><strong>{t.vendor_name || t.description || "Transaction"}</strong><small>{t.tx_date}</small></span>
                      <span>{t.account_name || "Uncategorized"}</span>
                      <span className={t.flow_type}>{t.flow_type === "income" ? "+" : "−"}{money(t.amount_cents)}</span>
                      <span>
                        <select value={t.allocation_status === "overhead" ? "overhead" : t.homes?.id || t.property_id || ""} onChange={(e) => e.target.value === "overhead" ? assign(t.id, null, true) : assign(t.id, e.target.value || null)}>
                          <option value="">Needs review</option>
                          <option value="overhead">Company overhead</option>
                          {homes.map((h) => <option key={h.id} value={h.id}>{h.address1}</option>)}
                        </select>
                      </span>
                      <span><b className={`confidence ${t.match_confidence >= 0.9 ? "high" : t.match_confidence > 0.5 ? "medium" : "low"}`}>{Math.round((t.match_confidence || 0) * 100)}%</b></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {view === "migrate" && (
          <div className="panel">
            <PanelTitle eyebrow="OPTIONAL" title="Bring in old QuickBooks rows" />
            <p className="summary">HomeOps is already the operating books. Use this only to load historical QBO CSV so Insights has prior months. It does not replace rent collection or bills.</p>
            <button className="secondaryBtn" onClick={() => setShowImport(true)}>Map a QuickBooks export</button>
          </div>
        )}
      </section>
      {showImport && (
        <div className="modalShade">
          <div className="modal importModal">
            <div className="modalHead"><div><p className="eyebrow">HISTORICAL IMPORT</p><h2>Map a QBO export once</h2></div><button className="closeBtn" onClick={() => setShowImport(false)}>×</button></div>
            <p className="summary">Unmatched rows go to Insights → Review. New rent and bills should be entered in HomeOps, not re-imported.</p>
            <label className="dropZone">Choose CSV<input type="file" accept=".csv,text/csv" onChange={(e) => chooseFile(e.target.files?.[0])} /><strong>{fileName || "Choose CSV file"}</strong><span>{rows.length ? `${rows.length} rows detected` : "Optional migration only"}</span></label>
            {headers.length > 0 && (
              <div className="mappingGrid">
                {[["date", "Transaction date *"], ["vendor", "Vendor / payee"], ["description", "Description"], ["amount", "Amount"], ["debit", "Debit"], ["credit", "Credit"], ["account", "Account / category"], ["qbClass", "QuickBooks Class"], ["qbLocation", "QuickBooks Location"], ["customerProject", "Customer / Project"], ["memo", "Memo"]].map(([key, label]) => (
                  <label key={key}>{label}<select value={mapping[key] || ""} onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}><option value="">Not mapped</option>{headers.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
                ))}
              </div>
            )}
            <div className="modalActions">
              <button className="secondaryBtn" onClick={() => setShowImport(false)}>Cancel</button>
              <button className="primary" onClick={() => void importRows()} disabled={Boolean(busy) || !rows.length}>{busy === "import" ? "Importing…" : "Import history"}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthRange(period: string) {
  const [year, month] = period.split("-").map(Number);
  const last = new Date(year, month, 0).getDate();
  return { start: `${period}-01`, end: `${period}-${String(last).padStart(2, "0")}` };
}

function PanelTitle({ eyebrow, title, aside }: { eyebrow: string; title: string; aside?: React.ReactNode }) {
  return <div className="panelHead"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{aside}</div>;
}
function MetricCards({ intel }: { intel: ReturnType<typeof buildPortfolioIntelligence> }) {
  return (
    <div className="stats finStats">
      <div className="stat"><span>Portfolio revenue</span><div className="statValue good">{money(intel.revenue)}</div></div>
      <div className="stat"><span>Operating expenses</span><div className="statValue">{money(intel.operatingExpenses)}</div><small>{pct(intel.operatingExpenses / (intel.revenue || 1))} of revenue</small></div>
      <div className="stat"><span>Operating NOI</span><div className={`statValue ${intel.operatingNoi >= 0 ? "good" : "warn"}`}>{money(intel.operatingNoi)}</div></div>
      <div className="stat"><span>Capital</span><div className="statValue">{money(intel.capitalExpenses)}</div><small>{money(intel.overhead)} overhead</small></div>
    </div>
  );
}
function InsightList({ insights }: { insights: ReturnType<typeof buildPortfolioIntelligence>["insights"] }) {
  return <div className="insightList">{insights.map((x, i) => <div key={x.title + i} className={`insight ${x.severity}`}><span /><div><strong>{x.title}</strong><p>{x.detail}</p></div></div>)}</div>;
}
function PropertyTable({ properties, onSelect }: { properties: ReturnType<typeof buildPortfolioIntelligence>["properties"]; onSelect: (id: string) => void }) {
  return (
    <div className="portfolioTable">
      <div className="portfolioTr intelHead"><span>Property</span><span>Revenue</span><span>Expenses</span><span>NOI</span><span>Margin</span></div>
      {properties.map((x) => (
        <button className="portfolioTr propertyLink" key={x.home.id} onClick={() => onSelect(x.home.id)}>
          <span><strong>{x.home.address1}</strong><small>{x.home.city}, {x.home.state}</small></span>
          <span>{money(x.revenue)}</span>
          <span>{money(x.expenses)}</span>
          <span className={x.noi >= 0 ? "goodText" : "badText"}><strong>{money(x.noi)}</strong></span>
          <span>{pct(x.margin)} →</span>
        </button>
      ))}
    </div>
  );
}
