"use client";

import { useMemo, useState } from "react";
import BrandLockup from "@/components/brand-lockup";
import { moneyCents } from "@/lib/rent";
import {
  SCHEDULE_E_UNTRACKED,
  accountantCsv,
  nec1099Csv,
  scheduleECsv,
  type YearReport,
} from "@/lib/books-reports";

const money = (cents: number) => moneyCents(cents);

function saveCsv(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function BooksReportView({
  report,
  variant,
  year,
  onYear,
}: {
  report: YearReport;
  variant: "app" | "print";
  year?: number;
  onYear?: (year: number) => void;
}) {
  const [doorId, setDoorId] = useState(report.scheduleE[0]?.homeId || "");
  const sheet = useMemo(
    () => report.scheduleE.find((row) => row.homeId === doorId) || report.scheduleE[0],
    [report.scheduleE, doorId],
  );
  const years = Array.from(new Set([report.year, report.year - 1, new Date().getFullYear()])).sort((a, b) => b - a);

  function printPacket() {
    if (variant === "print") {
      window.print();
      return;
    }
    window.open(`/financials/print?year=${report.year}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className={variant === "print" ? "reportDoc" : "reportApp"}>
      {variant === "print" && (
        <header className="reportPrintHead">
          <BrandLockup />
          <div>
            <p className="eyebrow">OWNER AND TAX PACKET</p>
            <h1>{report.year} cash reports</h1>
            <p>HomeOps cash books for {report.start} through {report.end}. This is a worksheet for the manager, owner, and CPA. It is not a filed tax return.</p>
          </div>
        </header>
      )}
      {variant === "app" && (
        <div className="propertyPicker">
          <div>
            <p className="eyebrow">ANNUAL PACKET</p>
            <h2>{report.year} owner, door, and CPA reports</h2>
          </div>
          {onYear && (
            <select value={year || report.year} onChange={(event) => onYear(Number(event.target.value))}>
              {years.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          )}
        </div>
      )}
      <div className="reportActions reportNoPrint">
        <button className="primary" type="button" onClick={printPacket}>{variant === "print" ? "Print / Save PDF" : "Open print / PDF"}</button>
        <button className="secondaryBtn" type="button" onClick={() => saveCsv(`homeops-accountant-${report.year}.csv`, accountantCsv(report))}>Accountant CSV</button>
        <button className="secondaryBtn" type="button" onClick={() => saveCsv(`homeops-schedule-e-${report.year}.csv`, scheduleECsv(report))}>Schedule E CSV</button>
        <button className="secondaryBtn" type="button" onClick={() => saveCsv(`homeops-1099-${report.year}.csv`, nec1099Csv(report))}>1099 worksheet CSV</button>
      </div>
      <div className="stats finStats">
        <div className="stat"><span>Cash in</span><div className="statValue good">{money(report.income)}</div><small>Rent and tenant fees</small></div>
        <div className="stat"><span>Operating</span><div className="statValue">{money(report.operating)}</div></div>
        <div className="stat"><span>NOI</span><div className={`statValue ${report.noi >= 0 ? "good" : "warn"}`}>{money(report.noi)}</div></div>
        <div className="stat"><span>Due after capex / draws</span><div className="statValue">{money(Math.max(0, report.noi - report.capital + report.contributions - report.disbursed))}</div><small>{money(report.capital)} capex · {money(report.disbursed)} sent</small></div>
      </div>

      <div className="panel reportSheet">
        <div className="panelHead"><div><p className="eyebrow">OWNERS</p><h2>Year cash by owner</h2></div></div>
        <div className="finTable reportTable">
          <div className="finTr finHead"><span>Owner</span><span>Income</span><span>Operating</span><span>Capex</span><span>Sent</span><span>Due</span></div>
          {report.owners.map((row) => (
            <div className="finTr" key={row.owner.id}>
              <span><strong>{row.owner.name}</strong><small>{row.doors.length} door{row.doors.length === 1 ? "" : "s"}</small></span>
              <span>{money(row.income)}</span>
              <span>{money(row.operating)}</span>
              <span>{money(row.capital)}</span>
              <span>{money(row.disbursed)}</span>
              <span><b className={row.dueToOwner ? "income" : ""}>{money(row.dueToOwner)}</b></span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel reportSheet">
        <div className="panelHead"><div><p className="eyebrow">DOORS</p><h2>Year cash by property</h2></div></div>
        <div className="finTable reportTable">
          <div className="finTr finHead"><span>Door</span><span>Owner</span><span>Income</span><span>Operating</span><span>NOI</span><span>After capex</span></div>
          {report.doors.map((row) => (
            <div className="finTr" key={row.home.id}>
              <span><strong>{row.home.address1}</strong><small>{row.home.city}, {row.home.state}</small></span>
              <span>{row.ownerName}</span>
              <span>{money(row.income)}</span>
              <span>{money(row.operating)}</span>
              <span className={row.noi >= 0 ? "goodText" : "badText"}>{money(row.noi)}</span>
              <span>{money(row.cash)}</span>
            </div>
          ))}
        </div>
      </div>

      {sheet && (
        <div className="panel reportSheet">
          <div className="panelHead">
            <div><p className="eyebrow">SCHEDULE E WORKSHEET</p><h2>Cash lines for the CPA</h2></div>
            <select value={sheet.homeId} onChange={(event) => setDoorId(event.target.value)}>
              {report.scheduleE.map((row) => <option key={row.homeId} value={row.homeId}>{row.address}</option>)}
            </select>
          </div>
          <p className="summary">{sheet.address} · {sheet.ownerName}. Line numbers follow Form 1040 Schedule E Part I. HomeOps does not file this form.</p>
          <div className="finTable seTable">
            <div className="finTr finHead"><span>Line</span><span>Category</span><span>Amount</span></div>
            {sheet.lines.map((line) => (
              <div className="finTr" key={line.id}>
                <span>{line.line}</span>
                <span>{line.label}</span>
                <span>{money(line.amountCents)}</span>
              </div>
            ))}
            <div className="finTr"><span>20</span><span>Total expenses</span><span>{money(sheet.totalExpenses)}</span></div>
            <div className="finTr"><span>21</span><span>Rents minus expenses</span><span className={sheet.rentalIncome >= 0 ? "goodText" : "badText"}><strong>{money(sheet.rentalIncome)}</strong></span></div>
            <div className="finTr"><span></span><span>Capital improvements (not deducted)</span><span>{money(sheet.capitalCents)}</span></div>
          </div>
          <p className="summary">Not tracked here (enter from bank or lender): {SCHEDULE_E_UNTRACKED.map((row) => `line ${row.line} ${row.label}`).join(" · ")}.</p>
        </div>
      )}

      <div className="panel reportSheet">
        <div className="panelHead"><div><p className="eyebrow">1099-NEC WORKSHEET</p><h2>Paid vendors at or above $600</h2></div><span className="pill">{report.necOverThreshold} of {report.nec1099.length} over threshold</span></div>
        <p className="summary">Cash paid to repair, trade, capital, and management vendors in {report.year}. Insurance, taxes, HOA, utilities, and software overhead are excluded. This is not an e-file and TINs are not included.</p>
        <div className="finTable necTable">
          <div className="finTr finHead"><span>Vendor</span><span>Paid</span><span>Payments</span><span>$600+</span><span>Doors / type</span></div>
          {report.nec1099.map((row) => (
            <div className="finTr" key={row.vendorName}>
              <span><strong>{row.vendorName}</strong><small>{row.kinds.join(" · ")}</small></span>
              <span>{money(row.amountCents)}</span>
              <span>{row.transactions}</span>
              <span><b className={`confidence ${row.meetsThreshold ? "high" : "low"}`}>{row.meetsThreshold ? "Yes" : "No"}</b></span>
              <span>{row.doors.join(" · ")}</span>
            </div>
          ))}
          {!report.nec1099.length && <div className="empty">No 1099-likely vendor payments in this year.</div>}
        </div>
      </div>

      <div className="panel reportSheet">
        <div className="panelHead"><div><p className="eyebrow">FOR THE CPA</p><h2>How to use this packet</h2></div></div>
        <ul className="reportNotes">
          {report.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      </div>
    </div>
  );
}
