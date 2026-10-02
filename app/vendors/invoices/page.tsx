"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import VendorPortalFrame from "@/components/vendor-portal-frame";

type Line = { description: string; amount: string };
type Project = { key: string; kind: "bid" | "job"; label: string; detail: string; billToName: string | null; billToEmail: string | null; amountCents: number | null; description: string | null };
type Match = { id: string; name: string; matchedBy: "name" | "email" | "account" };
type Client = { name: string; email: string; projectLabel: string; details: string; amount: number; description: string };
type Sent = {
  id: string;
  number: string;
  billToName: string;
  billToEmail: string;
  projectLabel: string;
  totalCents: number;
  dueOn: string;
  viewUrl: string;
  deliveryError: string | null;
  sentAt: string | null;
  status: string;
  paidSource?: string | null;
};

const OTHER = "other";
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default function VendorInvoicesPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [projectKey, setProjectKey] = useState(OTHER);
  const [lines, setLines] = useState<Line[]>([{ description: "", amount: "" }]);
  const [billToName, setBillToName] = useState("");
  const [billToEmail, setBillToEmail] = useState("");
  const [projectLabel, setProjectLabel] = useState("");
  const [details, setDetails] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [sent, setSent] = useState<Sent[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientMode, setClientMode] = useState<"new" | "existing">("new");
  const [clientKey, setClientKey] = useState("");
  const [filled, setFilled] = useState({ name: "", email: "", project: "", amount: "", description: "" });
  const [updateClient, setUpdateClient] = useState(false);
  const [updateJob, setUpdateJob] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    return fetch("/api/vendors/invoices").then(async (r) => {
      if (r.status === 401) { router.replace("/vendors/login"); return null; }
      return r.json();
    }).then((body) => {
      if (!body) return;
      if (body.error) { setMessage(body.error); return; }
      setSent(body.invoices || []);
      setClients(body.clients || []);
      setProjects(body.platform?.projects || []);
      setMatches(body.platform?.matches || []);
    }).catch(() => setMessage("Could not load invoices."));
  }

  useEffect(() => { void load(); }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  function setLine(index: number, patch: Partial<Line>) {
    setLines((rows) => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  }

  function pickProject(key: string) {
    setProjectKey(key);
    if (key === OTHER) { setProjectLabel(""); return; }
    const project = projects.find((row) => row.key === key);
    if (!project) return;
    setProjectLabel(project.label);
    if (project.billToName) setBillToName(project.billToName);
    if (project.billToEmail) setBillToEmail(project.billToEmail);
    if (project.description) setLines((rows) => [{ description: project.description || "", amount: project.amountCents ? String(project.amountCents / 100) : rows[0]?.amount || "" }, ...rows.slice(1)]);
    setFilled({
      name: project.billToName || billToName,
      email: project.billToEmail || billToEmail,
      project: project.label,
      amount: project.amountCents ? String(project.amountCents / 100) : "",
      description: project.description || "",
    });
  }

  function pickClient(email: string) {
    setClientKey(email);
    const client = clients.find((row) => row.email === email);
    const awarded = projects.find((row) =>
      row.kind === "bid" && /awarded/i.test(row.detail) && (
        (row.billToEmail && row.billToEmail.toLowerCase() === email.toLowerCase())
        || (client && row.billToName && row.billToName === client.name)
      )
    ) || projects.find((row) => row.kind === "bid" && /awarded/i.test(row.detail));
    if (!client) return;
    setBillToName(client.name);
    setBillToEmail(client.email);
    setProjectLabel(awarded?.label || client.projectLabel);
    setDetails(client.details || "");
    const description = awarded?.description || client.description;
    const amount = awarded?.amountCents ? awarded.amountCents / 100 : client.amount;
    setLines([{ description, amount: amount ? String(amount) : "" }]);
    if (awarded) setProjectKey(awarded.key);
    setFilled({ name: client.name, email: client.email, project: awarded?.label || client.projectLabel, amount: amount ? String(amount) : "", description });
    setUpdateClient(false);
    setUpdateJob(false);
  }

  const clientDirty = clientMode === "existing" && (billToName !== filled.name || billToEmail !== filled.email);
  const jobDirty = clientMode === "existing" && (projectLabel !== filled.project || lines[0]?.description !== filled.description || lines[0]?.amount !== filled.amount);
  const bids = projects.filter((row) => row.kind === "bid");
  const jobs = projects.filter((row) => row.kind === "job");

  async function setStatus(row: Sent, status: string) {
    const response = await fetch("/api/vendors/invoices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, status }),
    });
    const body = await response.json();
    if (!response.ok) { setMessage(body.error || "Could not update status."); return; }
    setSent(body.invoices || []);
  }

  const statuses = ["draft", "sent", "viewed", "paid", "overdue", "void"] as const;
  const total = lines.reduce((sum, line) => sum + (Number(line.amount) > 0 ? Math.round(Number(line.amount) * 100) : 0), 0);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch("/api/vendors/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        billToName,
        billToEmail,
        previousEmail: filled.email || billToEmail,
        projectLabel,
        projectKey: projectKey === OTHER ? null : projectKey,
        details,
        dueOn,
        lines,
        updateClient,
        updateJob,
      }),
    });
    const body = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(body.error || "Could not send the invoice."); return; }
    const delivery = body.delivery?.sent
      ? `Emailed to ${billToEmail}.`
      : `The invoice is ready, but email did not send (${body.delivery?.error || "not configured"}). Copy the link.`;
    setMessage(`${body.invoice.number} · ${delivery}`);
    setSent((rows) => [body.invoice, ...rows.filter((row: Sent) => row.id !== body.invoice.id)]);
    setLines([{ description: "", amount: "" }]);
    setDetails("");
    setProjectKey(OTHER);
    setProjectLabel("");
    // Re-check the platform for this company's bids and jobs before the next invoice.
    void load();
  }

  return (
    <VendorPortalFrame
      eyebrow="INVOICES"
      title="Send an invoice."
      lede="The email carries a link to the PDF, not an attachment."
    >
      {matches.length > 0 && (
        <p className="platformMatch">
          Your company matched {matches.map((row) => row.name).join(", ")} on the platform by {matches.some((row) => row.matchedBy === "email") ? "email" : "name"}.
          Bids and jobs from that record are listed under Project.
        </p>
      )}
      {message && <div className="notice">{message}</div>}
      <p><button className="textLink" type="button" onClick={() => setHistoryOpen((open) => !open)}>{historyOpen ? "Hide historical invoices" : "View historical invoices"}</button></p>
      {historyOpen && sent.length > 0 && (
        <div className="credentialList">
          {sent.map((row) => (
            <div className="credential" key={`hist-${row.id}`}>
              <div>
                <strong>{row.number} · {money(row.totalCents)}</strong>
                <span>{row.billToName} · {row.status}</span>
              </div>
              <label className="invoiceStatus">
                Status
                <select value={row.status} disabled={row.paidSource === "platform"} onChange={(e) => void setStatus(row, e.target.value)}>
                  {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <a className="secondaryBtn" href={`${row.viewUrl}?as=vendor`}>View</a>
            </div>
          ))}
        </div>
      )}
      <form onSubmit={submit}>
        <fieldset className="marketingRolePick marketingRolePick-inline">
          <legend>Client</legend>
          <div className="marketingRoleRow">
            <label className="miniCheck">
              <input type="radio" name="clientMode" checked={clientMode === "new"} onChange={() => { setClientMode("new"); setClientKey(""); }} />
              <span>New client</span>
            </label>
            <label className="miniCheck">
              <input type="radio" name="clientMode" checked={clientMode === "existing"} onChange={() => setClientMode("existing")} disabled={clients.length === 0} />
              <span>Existing client</span>
            </label>
          </div>
        </fieldset>
        {clientMode === "existing" ? (
          <label>Bill to
            <select required value={clientKey} onChange={(e) => pickClient(e.target.value)}>
              <option value="">Choose a client</option>
              {clients.map((row) => <option key={row.email} value={row.email}>{row.name} · {row.email}</option>)}
            </select>
          </label>
        ) : (
          <div className="formGrid">
            <label>Bill to<input required value={billToName} onChange={(e) => setBillToName(e.target.value)} placeholder="Customer or company" /></label>
            <label>Their email<input required type="email" value={billToEmail} onChange={(e) => setBillToEmail(e.target.value)} placeholder="billing@customer.com" /></label>
          </div>
        )}
        {clientMode === "existing" && (
          <div className="formGrid">
            <label>Bill to name<input required value={billToName} onChange={(e) => setBillToName(e.target.value)} /></label>
            <label>Their email<input required type="email" value={billToEmail} onChange={(e) => setBillToEmail(e.target.value)} /></label>
          </div>
        )}
        {(clientDirty || jobDirty) && (
          <div className="checkRow">
            {clientDirty && <label className="miniCheck"><input type="checkbox" checked={updateClient} onChange={(e) => setUpdateClient(e.target.checked)} /><span>Update client info</span></label>}
            {jobDirty && <label className="miniCheck"><input type="checkbox" checked={updateJob} onChange={(e) => setUpdateJob(e.target.checked)} /><span>Update job info</span></label>}
          </div>
        )}
        <div className="formGrid">
          <label className="projectPick">
            Project
            <select value={projectKey} onChange={(e) => pickProject(e.target.value)}>
              {bids.length > 0 && (
                <optgroup label="Your bids">
                  {bids.map((row) => <option key={row.key} value={row.key}>{row.label} · {row.detail}</option>)}
                </optgroup>
              )}
              {jobs.length > 0 && (
                <optgroup label="Your jobs">
                  {jobs.map((row) => <option key={row.key} value={row.key}>{row.label} · {row.detail}</option>)}
                </optgroup>
              )}
              <option value={OTHER}>{projects.length ? "Other · enter it below" : "Other · enter the project below"}</option>
            </select>
          </label>
          <label>Due<input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} /></label>
        </div>
        {projectKey === OTHER && (
          <label>Project name<input value={projectLabel} onChange={(e) => setProjectLabel(e.target.value)} placeholder="Furnace repair · 100 Main St" /></label>
        )}
        <div className="sectionTitle"><h3>Costs</h3><span>{money(total)}</span></div>
        {lines.map((line, index) => (
          <div className="formGrid" key={index}>
            <label>Description<input required value={line.description} onChange={(e) => setLine(index, { description: e.target.value })} placeholder="Service call and repair" /></label>
            <label>Amount ($)<input required type="number" min="0.01" step="0.01" value={line.amount} onChange={(e) => setLine(index, { amount: e.target.value })} /></label>
          </div>
        ))}
        <button className="secondaryBtn" type="button" onClick={() => setLines((rows) => [...rows, { description: "", amount: "" }])}>Add a cost</button>
        <label>Additional details<textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What was done, parts used, or what the property manager should know." /></label>
        <button className="primary" type="submit" disabled={busy}>{busy ? "Sending…" : `Email invoice · ${money(total)}`}</button>
      </form>
      {sent.length > 0 && (
        <>
          <div className="sectionTitle"><h3>Sent</h3><span>{sent.length}</span></div>
          <div className="credentialList">
            {sent.map((row) => (
              <div className="credential" key={row.id}>
                <div>
                  <strong>{row.number} · {money(row.totalCents)}</strong>
                  <span>{row.billToName} · {row.billToEmail}{row.projectLabel ? ` · ${row.projectLabel}` : ""}</span>
                  <span>{row.deliveryError ? `Not emailed · ${row.deliveryError}` : row.status === "paid" ? "Paid" : "Emailed"}{row.dueOn ? ` · Due ${row.dueOn}` : ""}</span>
                </div>
                <label className="invoiceStatus">
                  Status
                  <select value={row.status} disabled={row.paidSource === "platform"} onChange={(e) => void setStatus(row, e.target.value)}>
                    {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
                <a className="secondaryBtn" href={`${row.viewUrl}?as=vendor`}>View</a>
              </div>
            ))}
          </div>
        </>
      )}
    </VendorPortalFrame>
  );
}
