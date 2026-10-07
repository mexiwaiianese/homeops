"use client";

import { useMemo, useState } from "react";
import {
  MIGRATION_FIELDS,
  buildMigrationPlan,
  parseCsv,
  suggestMapping,
  type MigrationMapping,
} from "@/lib/csv-migration";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

export default function CsvMigration({ mode, onSaved }: { mode: string; onSaved: (message: string) => void }) {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<MigrationMapping | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const plan = useMemo(
    () => (mapping ? buildMigrationPlan(rows, mapping, headers, notes) : null),
    [mapping, rows, headers, notes],
  );

  function applyText(name: string, text: string) {
    setSaved("");
    setError("");
    setFileName(name);
    const parsed = parseCsv(text);
    const nextMapping = suggestMapping(parsed.headers);
    const nextPlan = buildMigrationPlan(parsed.rows, nextMapping, parsed.headers);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(nextMapping);
    setNotes(nextPlan.rows.map((row) => row.notes));
  }

  function chooseFile(file?: File) {
    if (!file) return;
    file.text().then((text) => applyText(file.name, text)).catch(() => setError("That file could not be read. Use a CSV."));
  }

  async function loadSample() {
    const response = await fetch("/samples/portonos-import.csv");
    if (!response.ok) {
      setError("The sample file is missing.");
      return;
    }
    applyText("portonos-import.csv", await response.text());
  }

  function updateMap(key: keyof MigrationMapping, value: string) {
    if (!mapping) return;
    const next = { ...mapping, [key]: value };
    const nextPlan = buildMigrationPlan(rows, next, headers);
    setMapping(next);
    setNotes(nextPlan.rows.map((row) => row.notes));
  }

  async function commit() {
    if (!mapping || !plan) return;
    if (mode !== "live") {
      setError("This read is ready. Sign in to a workspace to save the homes, tenants, vendors, and history.");
      return;
    }
    setBusy(true);
    setError("");
    const response = await fetch("/api/financial/migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, headers, mapping, rows, notes }),
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(body.error || "Could not save this file.");
      return;
    }
    const message = `Saved ${body.homes} new homes, ${body.tenants} tenants, ${body.vendors} vendors, and ${body.transactions} transactions.`;
    setSaved(message);
    onSaved(message);
  }

  return (
    <div className="migrateJourney">
      <div className="migrateSteps" aria-label="Import steps">
        <span className="active">1 Upload</span>
        <span className={plan ? "active" : ""}>2 Map</span>
        <span className={plan ? "active" : ""}>3 Read</span>
        <span className={saved ? "active" : ""}>4 Save</span>
      </div>
      <div className="panel">
        <div className="panelHead">
          <div>
            <p className="eyebrow">ONE FILE</p>
            <h2>Bring in the spreadsheet you already have</h2>
          </div>
          <div className="headerActions">
            <button className="secondaryBtn" type="button" onClick={() => void loadSample()}>Preview the sample</button>
            <a className="secondaryBtn" href="/samples/portonos-import.csv" download>Sample headers</a>
          </div>
        </div>
        <p className="summary">Use the sample headers, or upload the CSV you already keep. A QuickBooks export works too. We read homes, tenants, history, and the vendors in that history. Columns we do not have a field for stay in Notes and Insights.</p>
        <label className="dropZone">
          Choose CSV
          <input type="file" accept=".csv,text/csv" onChange={(event) => chooseFile(event.target.files?.[0])} />
          <strong>{fileName || "Choose a CSV file"}</strong>
          <span>{rows.length ? `${rows.length} rows` : "The sample file is enough to see the read"}</span>
        </label>
        {error && <div className="notice error">{error}</div>}
        {saved && <div className="notice">{saved}</div>}
      </div>

      {mapping && plan && (
        <>
          <div className="panel">
            <div className="panelHead"><div><p className="eyebrow">MAP</p><h2>Check the columns</h2></div></div>
            <p className="summary">We matched what we recognized. Change any column that landed in the wrong field.</p>
            <div className="mappingGrid">
              {MIGRATION_FIELDS.map((field) => (
                <label key={field.key}>
                  {field.label}
                  <select value={mapping[field.key]} onChange={(event) => updateMap(field.key, event.target.value)}>
                    <option value="">Not mapped</option>
                    {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="noteField">
              <strong>Notes and Insights</strong>
              <p>{plan.unmapped.length ? plan.unmapped.join(", ") : "Every column is mapped. Add a column to the CSV and it will land here."}</p>
            </div>
          </div>

          <div className="stats finStats">
            <div className="stat"><span>Homes</span><div className="statValue">{plan.homes}</div></div>
            <div className="stat"><span>Tenants</span><div className="statValue">{plan.tenants}</div></div>
            <div className="stat"><span>Vendors from history</span><div className="statValue">{plan.vendors}</div></div>
            <div className="stat"><span>Transactions</span><div className="statValue">{plan.transactions}</div></div>
          </div>

          <div className="panel">
            <div className="panelHead"><div><p className="eyebrow">FROM THIS FILE</p><h2>What is already worth acting on</h2></div></div>
            <div className="insightList">
              {plan.insights.map((insight) => (
                <div className={`insight ${insight.tone === "money" ? "critical" : "watch"}`} key={insight.title}>
                  <span />
                  <div>
                    <strong>{insight.title}</strong>
                    <p>{insight.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panelHead"><div><p className="eyebrow">PREVIEW</p><h2>First rows, before anything is saved</h2></div></div>
            <div className="migratePreview">
              {plan.rows.slice(0, 6).map((row) => (
                <article key={row.index}>
                  <header>
                    <strong>{row.address || "No address"}</strong>
                    <span>{row.date || "No date"} · {row.flow ? `${row.flow === "income" ? "+" : "−"}${money(row.amountCents)}` : "No amount"}</span>
                  </header>
                  <p>{[row.tenant, row.vendor, row.account].filter(Boolean).join(" · ") || "Home only"}</p>
                  <label>
                    Notes and Insights
                    <textarea value={notes[row.index] || ""} onChange={(event) => setNotes((current) => current.map((note, index) => index === row.index ? event.target.value : note))} />
                  </label>
                </article>
              ))}
            </div>
            <div className="modalActions">
              <button className="primary" type="button" onClick={() => void commit()} disabled={busy}>
                {busy ? "Saving…" : "Save into the workspace"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
