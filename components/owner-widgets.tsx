"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { BookEntry } from "@/lib/books";
import {
  buildClosings,
  deltaPct,
  formatMetric,
  moneyCents,
  monthLabel,
  pct,
  PROPERTY_TYPES,
  type CashFlowStatement,
  type ClosingKind,
  type ClosingPeriod,
  type CustomMetric,
  type MonthPoint,
  type OwnerHome,
  type OwnerMaintenance,
  type PortfolioSnapshot,
  type ProfitAndLoss,
  type PropertyResult,
} from "@/lib/owner-portal";
import type { ExpressionResult } from "@/lib/metric-expression";

// ---------- Small building blocks ----------

export function Kpi({ label, value, sub, tone, delta, deltaLabel = "vs. prior period" }: { label: string; value: string; sub?: ReactNode; tone?: "good" | "warn" | "neutral"; delta?: number | null; deltaLabel?: string }) {
  return (
    <div className="opKpi">
      <span className="opKpiLabel">{label}</span>
      <strong className={`opKpiValue ${tone || ""}`}>{value}</strong>
      {delta != null && Number.isFinite(delta) && (
        <small className={`opDelta ${delta >= 0 ? "up" : "down"}`}>{delta >= 0 ? "▲" : "▼"} {pct(Math.abs(delta))} {deltaLabel}</small>
      )}
      {sub && <small className="opKpiSub">{sub}</small>}
    </div>
  );
}

export function WidgetTitle({ title, hint, aside }: { title: string; hint?: string; aside?: ReactNode }) {
  return (
    <div className="opWidgetHead">
      <div>
        <h3>{title}</h3>
        {hint && <p>{hint}</p>}
      </div>
      {aside}
    </div>
  );
}

// ---------- KPIs ----------

export function KpiWidget({ id, snapshot }: { id: string; snapshot: PortfolioSnapshot }) {
  const { pnl, prior, cash } = snapshot;
  switch (id) {
    case "kpi_cash_to_owner":
      return <Kpi label="Net to you" value={moneyCents(cash.netToOwner)} tone={cash.netToOwner >= 0 ? "good" : "warn"} sub={`${moneyCents(cash.disbursements)} already sent · ${moneyCents(pnl.capital)} capital`} />;
    case "kpi_noi":
      return <Kpi label="Net operating income" value={moneyCents(pnl.noi)} tone={pnl.noi >= 0 ? "good" : "warn"} delta={deltaPct(pnl.noi, prior.noi)} sub={`${pct(pnl.margin)} margin`} />;
    case "kpi_rent_collected":
      return <Kpi label="Rent collected" value={moneyCents(snapshot.variables.rent_collected * 100)} delta={deltaPct(pnl.income, prior.income)} sub={`${moneyCents(pnl.income)} total income`} />;
    case "kpi_occupancy":
      return <Kpi label="Occupancy" value={pct(snapshot.occupancy)} tone={snapshot.occupancy >= 0.95 ? "good" : snapshot.occupancy >= 0.8 ? "neutral" : "warn"} sub={`${snapshot.variables.occupied_doors} of ${snapshot.variables.doors} doors leased`} />;
    case "kpi_collection_rate":
      return <Kpi label="Collection rate" value={pct(snapshot.collectionRate)} tone={snapshot.collectionRate >= 0.97 ? "good" : snapshot.collectionRate >= 0.9 ? "neutral" : "warn"} sub={snapshot.rentOutstanding ? `${moneyCents(snapshot.rentOutstanding)} currently outstanding` : "Nothing outstanding"} />;
    case "kpi_opex_ratio":
      return <Kpi label="Expense ratio" value={pct(pnl.opexRatio)} tone={pnl.opexRatio <= 0.4 ? "good" : pnl.opexRatio <= 0.55 ? "neutral" : "warn"} sub="Operating expenses ÷ income" />;
    case "kpi_maintenance_per_door":
      return <Kpi label="Maintenance per door" value={moneyCents(snapshot.maintenancePerDoor)} sub={`${moneyCents(snapshot.variables.maintenance * 100)} total · ${snapshot.months} mo`} />;
    case "kpi_reserve":
      return <Kpi label="Reserve on hand" value={moneyCents(snapshot.reserveBalance)} tone={snapshot.reserveBalance >= snapshot.reserveFloor ? "good" : "warn"} sub={`Floor ${moneyCents(snapshot.reserveFloor)} · ${moneyCents(snapshot.depositsHeld)} deposits held`} />;
    default:
      return null;
  }
}

// ---------- Charts (inline SVG, no library) ----------

export function TrendChart({ series }: { series: MonthPoint[] }) {
  const width = 640;
  const height = 240;
  const pad = { top: 16, right: 12, bottom: 34, left: 52 };
  const data = series.length ? series : [{ month: "—", income: 0, operating: 0, capital: 0, noi: 0, cashFlow: 0 }];
  const max = Math.max(1, ...data.flatMap((point) => [point.income, point.operating + point.capital, point.noi]));
  const min = Math.min(0, ...data.map((point) => point.noi));
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const slot = plotW / data.length;
  const barW = Math.min(26, slot * 0.28);
  const y = (value: number) => pad.top + plotH - ((value - min) / (max - min)) * plotH;
  const zero = y(0);
  const line = data.map((point, index) => `${index === 0 ? "M" : "L"}${pad.left + slot * index + slot / 2},${y(point.noi)}`).join(" ");
  const ticks = [0, 0.5, 1].map((fraction) => min + (max - min) * fraction);
  const dollars = (cents: number) => `$${Math.round(cents / 100 / 1000)}k`;
  return (
    <div className="opChart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Income, expenses, and NOI by month">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="opGridLine" />
            <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" className="opAxis">{dollars(tick)}</text>
          </g>
        ))}
        {data.map((point, index) => {
          const x = pad.left + slot * index + slot / 2;
          const expenses = point.operating + point.capital;
          return (
            <g key={point.month}>
              <rect x={x - barW - 2} width={barW} y={y(point.income)} height={Math.max(0, zero - y(point.income))} className="opBarIncome" rx="3" />
              <rect x={x + 2} width={barW} y={y(expenses)} height={Math.max(0, zero - y(expenses))} className="opBarExpense" rx="3" />
              <text x={x} y={height - 12} textAnchor="middle" className="opAxis">{point.month === "—" ? "" : monthLabel(point.month)}</text>
            </g>
          );
        })}
        <path d={line} className="opNoiLine" />
        {data.map((point, index) => (
          <circle key={`${point.month}-dot`} cx={pad.left + slot * index + slot / 2} cy={y(point.noi)} r="3.5" className="opNoiDot" />
        ))}
      </svg>
      <div className="opLegend"><span><i className="income" />Income</span><span><i className="expense" />Expenses</span><span><i className="noi" />NOI</span></div>
    </div>
  );
}

export function ExpenseMix({ pnl }: { pnl: ProfitAndLoss }) {
  const lines = [...pnl.operatingLines.map((line) => ({ label: line.label, amount: line.amountCents, capital: false })), ...(pnl.capital ? [{ label: "Capital improvements", amount: pnl.capital, capital: true }] : [])];
  const total = lines.reduce((sum, line) => sum + line.amount, 0) || 1;
  if (!lines.length) return <div className="opEmpty">No expenses posted in this period.</div>;
  return (
    <div className="opMix">
      {lines.map((line) => (
        <div key={line.label} className="opMixRow">
          <div><strong>{line.label}</strong>{line.capital && <small>Capital</small>}</div>
          <div className="opMixTrack"><i className={line.capital ? "capital" : ""} style={{ width: `${Math.max(2, (line.amount / total) * 100)}%` }} /></div>
          <b>{moneyCents(line.amount)}<small>{pct(line.amount / total)}</small></b>
        </div>
      ))}
    </div>
  );
}

// ---------- Statements ----------

export function PnlStatement({ pnl, prior, compact = false }: { pnl: ProfitAndLoss; prior?: ProfitAndLoss; compact?: boolean }) {
  const Row = ({ label, amount, priorAmount, negative, total, strong }: { label: string; amount: number; priorAmount?: number; negative?: boolean; total?: boolean; strong?: boolean }) => (
    <div className={`opLine ${total ? "total" : ""} ${strong ? "strong" : ""}`}>
      <span>{label}</span>
      {!compact && prior && <small>{priorAmount != null ? moneyCents(priorAmount) : ""}</small>}
      <b className={negative ? "negative" : ""}>{negative && amount ? "−" : ""}{moneyCents(Math.abs(amount))}</b>
    </div>
  );
  // Show every line that appears in either period so the prior column always sums to its total.
  const union = (current: ProfitAndLoss["incomeLines"], previous?: ProfitAndLoss["incomeLines"]) => {
    const merged = new Map(current.map((line) => [line.kind, { ...line, priorCents: 0 }]));
    for (const line of previous || []) {
      const existing = merged.get(line.kind);
      if (existing) existing.priorCents = line.amountCents;
      else merged.set(line.kind, { kind: line.kind, label: line.label, amountCents: 0, priorCents: line.amountCents });
    }
    return [...merged.values()];
  };
  const incomeLines = union(pnl.incomeLines, compact ? undefined : prior?.incomeLines);
  const operatingLines = union(pnl.operatingLines, compact ? undefined : prior?.operatingLines).sort((a, b) => b.amountCents - a.amountCents || b.priorCents - a.priorCents);
  return (
    <div className="opStatement">
      {!compact && prior && <div className="opLine head"><span /><small>Prior</small><b>Current</b></div>}
      <div className="opLine section"><span>Income</span></div>
      {incomeLines.map((line) => <Row key={line.kind} label={line.label} amount={line.amountCents} priorAmount={line.priorCents} />)}
      <Row label="Total income" amount={pnl.income} priorAmount={prior?.income} strong />
      <div className="opLine section"><span>Operating expenses</span></div>
      {operatingLines.map((line) => <Row key={line.kind} label={line.label} amount={line.amountCents} priorAmount={line.priorCents} negative />)}
      <Row label="Total operating expenses" amount={pnl.operating} priorAmount={prior?.operating} negative strong />
      <Row label="Net operating income" amount={pnl.noi} priorAmount={prior?.noi} total />
      {pnl.capital > 0 && <Row label="Capital improvements" amount={pnl.capital} priorAmount={prior?.capital} negative />}
      {pnl.capital > 0 && <Row label="Cash flow after capital" amount={pnl.cashFlow} priorAmount={prior?.cashFlow} total />}
    </div>
  );
}

export function CashFlowView({ cash }: { cash: CashFlowStatement }) {
  const rows: Array<[string, number, boolean?]> = [
    ["Net operating income", cash.noi],
    ["Capital improvements", -cash.capital],
    ["Owner contributions", cash.contributions],
    ["Disbursements already sent to you", -cash.disbursements],
  ];
  return (
    <div className="opStatement">
      {rows.map(([label, amount]) => (
        <div key={label} className="opLine"><span>{label}</span><b className={amount < 0 ? "negative" : ""}>{amount < 0 ? "−" : ""}{moneyCents(Math.abs(amount))}</b></div>
      ))}
      <div className="opLine total"><span>Net to you this period</span><b className={cash.netToOwner < 0 ? "negative" : "good"}>{cash.netToOwner < 0 ? "−" : ""}{moneyCents(Math.abs(cash.netToOwner))}</b></div>
      {(cash.depositsIn || cash.depositsOut) ? (
        <div className="opLine muted"><span>Security deposits held / returned (not your cash)</span><b>{moneyCents(cash.depositsIn)} / {moneyCents(cash.depositsOut)}</b></div>
      ) : null}
    </div>
  );
}

export function PropertiesTable({ properties, onFocus }: { properties: PropertyResult[]; onFocus: (homeId: string) => void }) {
  if (!properties.length) return <div className="opEmpty">No properties match these filters.</div>;
  return (
    <div className="opTableWrap">
      <div className="opTable properties">
        <div className="opTr head"><span>Property</span><span>Income</span><span>Operating</span><span>NOI</span><span>Margin</span><span>Collected</span></div>
        {properties.map((row) => (
          <button type="button" className="opTr" key={row.home.id} onClick={() => onFocus(row.home.id)}>
            <span><strong>{row.home.address1}</strong><small>{PROPERTY_TYPES[row.home.type]} · {row.home.occupied ? row.home.tenantName || "Leased" : "Vacant"}</small></span>
            <span>{moneyCents(row.income)}</span>
            <span>{moneyCents(row.operating)}</span>
            <span className={row.noi >= 0 ? "good" : "negative"}><strong>{moneyCents(row.noi)}</strong></span>
            <span>{pct(row.margin)}</span>
            <span>{pct(row.collectionRate)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Closed periods (month / quarter / year) ----------

function closingsCsv(periods: ClosingPeriod[]) {
  const escape = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
  };
  const header = ["Period", "Start", "End", "Income", "Operating expenses", "NOI", "Capital", "Contributions", "Disbursements", "Net to owner", "Status"];
  const rows = periods.map((period) => [
    period.range.label, period.range.start, period.range.end,
    (period.pnl.income / 100).toFixed(2), (period.pnl.operating / 100).toFixed(2), (period.pnl.noi / 100).toFixed(2), (period.pnl.capital / 100).toFixed(2),
    (period.cash.contributions / 100).toFixed(2), (period.cash.disbursements / 100).toFixed(2), (period.cash.netToOwner / 100).toFixed(2), period.closed ? "Closed" : "Open",
  ]);
  return `\uFEFF${[header, ...rows].map((row) => row.map(escape).join(",")).join("\r\n")}`;
}

export function Closings({ entries, homes, partial = false }: { entries: BookEntry[]; homes: OwnerHome[]; partial?: boolean }) {
  const [kind, setKind] = useState<ClosingKind>("month");
  const [openId, setOpenId] = useState<string | null>(null);
  const periods = useMemo(() => buildClosings(entries, homes, kind, new Date(), { includeUnassigned: !partial }), [entries, homes, kind, partial]);
  const open = periods.find((period) => period.id === openId) || null;

  function download() {
    const blob = new Blob([closingsCsv(periods)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `owner-${kind}ly-closings.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="opSubBar">
        <div className="opSegment" role="tablist">
          {(["month", "quarter", "year"] as ClosingKind[]).map((option) => (
            <button key={option} type="button" role="tab" aria-selected={kind === option} className={kind === option ? "active" : ""} onClick={() => { setKind(option); setOpenId(null); }}>
              {option === "month" ? "Monthly" : option === "quarter" ? "Quarterly" : "Annual"}
            </button>
          ))}
        </div>
        <button type="button" className="opTextBtn" onClick={download} disabled={!periods.length}>Download CSV</button>
      </div>
      {!periods.length && <div className="opEmpty">No closed periods yet.</div>}
      <div className="opTableWrap">
        <div className="opTable closings">
          {periods.length > 0 && <div className="opTr head"><span>Period</span><span>Income</span><span>Operating</span><span>NOI</span><span>Net to you</span><span /></div>}
          {periods.map((period) => (
            <button type="button" className={`opTr ${openId === period.id ? "open" : ""}`} key={period.id} onClick={() => setOpenId(openId === period.id ? null : period.id)}>
              <span><strong>{period.range.label}</strong><small>{period.closed ? "Closed" : "In progress"}</small></span>
              <span>{moneyCents(period.pnl.income)}</span>
              <span>{moneyCents(period.pnl.operating)}</span>
              <span className={period.pnl.noi >= 0 ? "good" : "negative"}><strong>{moneyCents(period.pnl.noi)}</strong></span>
              <span>{moneyCents(period.cash.netToOwner)}</span>
              <span className="opChevron">{openId === period.id ? "▾" : "▸"}</span>
            </button>
          ))}
        </div>
      </div>
      {open && (
        <div className="opClosingDetail">
          <div>
            <h4>Profit & loss · {open.range.label}</h4>
            <PnlStatement pnl={open.pnl} compact />
          </div>
          <div>
            <h4>Cash flow · {open.range.label}</h4>
            <CashFlowView cash={open.cash} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Operations ----------

export function MaintenanceList({ items, homes }: { items: OwnerMaintenance[]; homes: OwnerHome[] }) {
  if (!items.length) return <div className="opEmpty">No open maintenance on these properties.</div>;
  return (
    <div className="opList">
      {items.map((item) => {
        const home = homes.find((row) => row.id === item.homeId);
        return (
          <div key={item.id} className={`opListRow ${item.needsOwnerApproval ? "attention" : ""}`}>
            <div>
              <strong>{item.title}</strong>
              <small>{home?.address1 || "Property"} · {item.priority} · {item.status}</small>
            </div>
            <b>{item.estimateCents ? moneyCents(item.estimateCents) : "TBD"}{item.needsOwnerApproval && <small>Needs your approval</small>}</b>
          </div>
        );
      })}
    </div>
  );
}

export function LeaseList({ homes }: { homes: OwnerHome[] }) {
  if (!homes.length) return <div className="opEmpty">No properties match these filters.</div>;
  const soon = (date?: string | null) => date && (new Date(`${date}T12:00:00`).getTime() - Date.now()) / 86400000 < 90;
  return (
    <div className="opList">
      {homes.map((home) => (
        <div key={home.id} className={`opListRow ${!home.occupied || soon(home.leaseEnds) ? "attention" : ""}`}>
          <div>
            <strong>{home.address1}</strong>
            <small>{home.occupied ? `${home.tenantName || "Leased"} · lease ends ${home.leaseEnds ? new Date(`${home.leaseEnds}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}` : "Vacant"}</small>
          </div>
          <b>{moneyCents(home.rentCents)}<small>{home.rentOutstandingCents ? `${moneyCents(home.rentOutstandingCents)} past due` : "per month"}</small></b>
        </div>
      ))}
    </div>
  );
}

// ---------- Custom (AI) metric ----------

export function CustomMetricCard({ metric, result, rangeLabel, scopeLabel, onRemove }: { metric: CustomMetric; result: ExpressionResult; rangeLabel: string; scopeLabel: string; onRemove?: () => void }) {
  return (
    <div className="opKpi custom">
      <span className="opKpiLabel">{metric.title}</span>
      <strong className="opKpiValue">{result.ok ? formatMetric(result.value, metric.format) : "—"}</strong>
      <small className="opKpiSub">{result.ok ? metric.explanation || metric.prompt : result.error}</small>
      <small className="opKpiMeta">{rangeLabel} · {scopeLabel}</small>
      {onRemove && <button type="button" className="opTextBtn" onClick={onRemove}>Unpin</button>}
    </div>
  );
}
