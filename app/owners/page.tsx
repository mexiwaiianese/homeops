"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import BrandLockup from "@/components/brand-lockup";
import { leavePersona } from "@/lib/persona-sign-out-client";
import OwnerDashboardGrid, { type GridItem } from "@/components/owner-dashboard-grid";
import {
  CashFlowView,
  Closings,
  CustomMetricCard,
  ExpenseMix,
  KpiWidget,
  LeaseList,
  MaintenanceList,
  PnlStatement,
  PropertiesTable,
  TrendChart,
  WidgetTitle,
} from "@/components/owner-widgets";
import {
  buildSnapshot,
  CUSTOM_WIDGET_PREFIX,
  defaultLayout,
  evaluateMetric,
  filterHomes,
  filtersToRange,
  formatMetric,
  moneyCents,
  normalizeLayout,
  PERIOD_PRESETS,
  PROPERTY_TYPES,
  WIDGETS,
  type CustomMetric,
  type DashboardFilters,
  type DashboardLayout,
  type MetricDefinition,
  type OwnerPortalPayload,
  type PeriodPreset,
  type PropertyType,
  type WidgetSize,
} from "@/lib/owner-portal";

type Ask = { id: string; prompt: string; definition: MetricDefinition; source: "ai" | "local"; note?: string | null; pinnedId?: string };

const SUGGESTIONS = [
  "Maintenance cost per door this year",
  "NOI as a percent of income",
  "How many months of expenses do my reserves cover?",
  "Annualized net to owner",
  "Management fees as a percent of rent collected",
  "Income change vs. the prior period",
];

function thisMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function OwnerPortalPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "auth" | "error">("loading");
  const [error, setError] = useState("");
  const [data, setData] = useState<OwnerPortalPayload | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<DashboardFilters>({ homeIds: [], types: [], preset: "ytd", customStart: thisMonth(), customEnd: thisMonth() });
  const [layout, setLayout] = useState<DashboardLayout>(defaultLayout());
  const [arrange, setArrange] = useState(false);
  const [saving, setSaving] = useState("");
  const [prompt, setPrompt] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState("");
  const [asks, setAsks] = useState<Ask[]>([]);
  const saveTimer = useRef<number | null>(null);

  // Manager preview passes ?ownerId=; owners arrive with a session.
  useEffect(() => {
    setQuery(window.location.search);
  }, []);

  const load = useCallback(async (search: string) => {
    const response = await fetch(`/api/owners/portal${search}`);
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) { setStatus("auth"); return; }
    if (!response.ok) { setStatus("error"); setError(body.error || "Could not load your portfolio."); return; }
    const payload = body as OwnerPortalPayload;
    setData(payload);
    const cached = safeParse(localStorage.getItem(`homeops-owner-layout-${payload.owner.id}`));
    setLayout(normalizeLayout(payload.layout || cached, payload.customMetrics));
    setStatus("ready");
  }, []);

  useEffect(() => {
    if (query === "" && typeof window !== "undefined" && window.location.search) return; // wait for the query to be read
    void load(query);
  }, [query, load]);

  const range = useMemo(() => filtersToRange(filters), [filters]);
  const scopedHomes = useMemo(() => (data ? filterHomes(data.homes, filters) : []), [data, filters]);
  const snapshot = useMemo(() => (data ? buildSnapshot({ owner: data.owner, homes: scopedHomes, entries: data.entries, maintenance: data.maintenance, range, totalHomes: data.homes.length }) : null), [data, scopedHomes, range]);

  const types = useMemo(() => {
    const present = new Set((data?.homes || []).map((home) => home.type));
    return (Object.keys(PROPERTY_TYPES) as PropertyType[]).filter((type) => present.has(type));
  }, [data]);

  function persistLayout(next: DashboardLayout) {
    setLayout(next);
    if (!data) return;
    localStorage.setItem(`homeops-owner-layout-${data.owner.id}`, JSON.stringify(next));
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      setSaving("saving");
      const response = await fetch(`/api/owners/portal/layout${query}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layout: next }) });
      setSaving(response.ok ? "saved" : "failed");
      window.setTimeout(() => setSaving(""), 1800);
    }, 600);
  }

  const items: GridItem[] = useMemo(() => {
    if (!data) return [];
    const customs = new Map(data.customMetrics.map((metric) => [`${CUSTOM_WIDGET_PREFIX}${metric.id}`, metric]));
    return layout.order
      .filter((id) => !layout.hidden.includes(id))
      .map((id) => {
        const custom = customs.get(id);
        if (custom) return { id, size: layout.sizes?.[id] || "small", title: custom.title } as GridItem;
        const spec = WIDGETS.find((widget) => widget.id === id);
        return spec ? ({ id, size: layout.sizes?.[id] || spec.size, title: spec.title } as GridItem) : null;
      })
      .filter((item): item is GridItem => Boolean(item));
  }, [data, layout]);

  const hiddenItems = useMemo(() => {
    if (!data) return [] as Array<{ id: string; title: string }>;
    return layout.hidden.map((id) => {
      const custom = data.customMetrics.find((metric) => `${CUSTOM_WIDGET_PREFIX}${metric.id}` === id);
      return { id, title: custom?.title || WIDGETS.find((widget) => widget.id === id)?.title || id };
    });
  }, [data, layout]);

  async function ask(event?: FormEvent, text?: string) {
    event?.preventDefault();
    const question = (text ?? prompt).trim();
    if (!question || !data) return;
    setAsking(true);
    setAskError("");
    const response = await fetch(`/api/owners/portal/ask${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: question, filters }),
    });
    const body = await response.json().catch(() => ({}));
    setAsking(false);
    if (!response.ok) { setAskError(body.error || "Could not work that out."); return; }
    setAsks((current) => [{ id: `${Date.now()}`, prompt: question, definition: body.definition, source: body.source, note: body.note }, ...current].slice(0, 8));
    setPrompt("");
  }

  async function pin(askItem: Ask) {
    if (!data) return;
    const response = await fetch(`/api/owners/portal/metrics${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: askItem.prompt, definition: askItem.definition }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setAskError(body.error || "Could not pin that metric."); return; }
    const metric = body.metric as CustomMetric;
    const nextData = { ...data, customMetrics: [...data.customMetrics, metric] };
    setData(nextData);
    setAsks((current) => current.map((item) => (item.id === askItem.id ? { ...item, pinnedId: metric.id } : item)));
    persistLayout(normalizeLayout({ ...layout, order: [`${CUSTOM_WIDGET_PREFIX}${metric.id}`, ...layout.order] }, nextData.customMetrics));
  }

  async function unpin(metricId: string) {
    if (!data) return;
    const params = new URLSearchParams(query);
    params.set("id", metricId);
    const response = await fetch(`/api/owners/portal/metrics?${params.toString()}`, { method: "DELETE" });
    if (!response.ok) return;
    const nextData = { ...data, customMetrics: data.customMetrics.filter((metric) => metric.id !== metricId) };
    setData(nextData);
    setAsks((current) => current.map((item) => (item.pinnedId === metricId ? { ...item, pinnedId: undefined } : item)));
    persistLayout(normalizeLayout(layout, nextData.customMetrics));
  }

  async function signOut() {
    await leavePersona("/api/owners/session", "/owners/login");
  }

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  function renderWidget(id: string) {
    if (!data || !snapshot) return null;
    if (id.startsWith(CUSTOM_WIDGET_PREFIX)) {
      const metric = data.customMetrics.find((item) => `${CUSTOM_WIDGET_PREFIX}${item.id}` === id);
      if (!metric) return null;
      const evaluation = evaluateMetric(metric, { owner: data.owner, homes: data.homes, entries: data.entries, maintenance: data.maintenance, filters });
      return <CustomMetricCard metric={metric} result={evaluation.result} rangeLabel={evaluation.range.label} scopeLabel={scopeLabel(evaluation.homes.length, data.homes.length)} onRemove={arrange ? () => void unpin(metric.id) : undefined} />;
    }
    if (id.startsWith("kpi_")) return <KpiWidget id={id} snapshot={snapshot} />;
    switch (id) {
      case "chart_trend":
        return <><WidgetTitle title="Income vs. expenses" hint={`${range.label} · NOI line`} /><TrendChart series={snapshot.series} /></>;
      case "chart_expense_mix":
        return <><WidgetTitle title="Where the money went" hint={`${moneyCents(snapshot.pnl.operating + snapshot.pnl.capital)} total expenses`} /><ExpenseMix pnl={snapshot.pnl} /></>;
      case "pnl":
        return <><WidgetTitle title="Profit & loss" hint={range.label} /><PnlStatement pnl={snapshot.pnl} prior={snapshot.prior} /></>;
      case "cash_flow":
        return <><WidgetTitle title="Cash flow to you" hint={snapshot.partial ? "Property view: owner draws and contributions are portfolio-level and appear when all properties are selected" : `${range.label} · disbursements on the ${ordinal(data.owner.disbursementDay)}`} /><CashFlowView cash={snapshot.cash} /></>;
      case "properties":
        return <><WidgetTitle title="Property results" hint="Tap a property to focus the whole dashboard on it" /><PropertiesTable properties={snapshot.properties} onFocus={(homeId) => setFilters((current) => ({ ...current, homeIds: [homeId] }))} /></>;
      case "closings":
        return <><WidgetTitle title="Closed periods" hint="Month, quarter, and annual closings for the properties in scope" /><Closings entries={data.entries} homes={scopedHomes} partial={snapshot.partial} /></>;
      case "maintenance":
        return <><WidgetTitle title="Open maintenance" hint={`${snapshot.openMaintenance.length} open · ${moneyCents(snapshot.variables.maintenance_estimates * 100)} estimated`} /><MaintenanceList items={snapshot.openMaintenance} homes={data.homes} /></>;
      case "leases":
        return <><WidgetTitle title="Leases & tenants" hint={`${snapshot.variables.occupied_doors} leased · ${snapshot.variables.vacant_doors} vacant`} /><LeaseList homes={scopedHomes} /></>;
      default:
        return null;
    }
  }

  useEffect(() => {
    if (status === "auth") window.location.replace("/owners/login");
  }, [status]);

  if (status === "auth") return null;

  return (
    <main className="opShell">
      <header className="opTop">
        <div className="opTopInner">
          <BrandLockup href="/owners" className="opBrand" />
          <div className="opTopMeta">
            {data && <strong>{data.owner.name}</strong>}
            {data && <span>{data.homes.length} {data.homes.length === 1 ? "property" : "properties"} · {data.mode === "live" ? "Live" : "Demo"}{data.preview ? " · Manager preview" : ""}</span>}
          </div>
          <div className="opTopActions">
            <button type="button" className={`opBtn ${arrange ? "active" : ""}`} onClick={() => setArrange((value) => !value)}>{arrange ? "Done arranging" : "Arrange"}</button>
            <button type="button" className="opBtn ghost" onClick={() => void signOut()}>Sign out</button>
          </div>
        </div>
      </header>

      {status === "loading" && <div className="opLoading">Loading your portfolio…</div>}
      {status === "error" && <div className="opNotice error">{error}</div>}

      {status === "ready" && data && snapshot && (
        <div className="opContent">
          <section className="opFilters" aria-label="Filters">
            <div className="opFilterRow">
              <span className="opFilterLabel">Period</span>
              <div className="opChips">
                {(Object.keys(PERIOD_PRESETS) as PeriodPreset[]).filter((preset) => preset !== "all").map((preset) => (
                  <button key={preset} type="button" className={`opChip ${filters.preset === preset ? "active" : ""}`} onClick={() => setFilters({ ...filters, preset })}>{PERIOD_PRESETS[preset]}</button>
                ))}
                <button type="button" className={`opChip ${filters.preset === "custom" ? "active" : ""}`} onClick={() => setFilters({ ...filters, preset: "custom" })}>Custom</button>
              </div>
              {filters.preset === "custom" && (
                <div className="opCustomRange">
                  <input type="month" value={filters.customStart} onChange={(event) => setFilters({ ...filters, customStart: event.target.value })} aria-label="From month" />
                  <span>to</span>
                  <input type="month" value={filters.customEnd} onChange={(event) => setFilters({ ...filters, customEnd: event.target.value })} aria-label="To month" />
                </div>
              )}
            </div>
            <div className="opFilterRow">
              <span className="opFilterLabel">Properties</span>
              <div className="opChips">
                <button type="button" className={`opChip ${!filters.homeIds.length ? "active" : ""}`} onClick={() => setFilters({ ...filters, homeIds: [] })}>All</button>
                {data.homes.map((home) => (
                  <button key={home.id} type="button" className={`opChip ${filters.homeIds.includes(home.id) ? "active" : ""}`} onClick={() => setFilters({ ...filters, homeIds: toggle(filters.homeIds, home.id) })}>{home.address1}</button>
                ))}
              </div>
            </div>
            {types.length > 1 && (
              <div className="opFilterRow">
                <span className="opFilterLabel">Type</span>
                <div className="opChips">
                  <button type="button" className={`opChip ${!filters.types.length ? "active" : ""}`} onClick={() => setFilters({ ...filters, types: [] })}>All types</button>
                  {types.map((type) => (
                    <button key={type} type="button" className={`opChip ${filters.types.includes(type) ? "active" : ""}`} onClick={() => setFilters({ ...filters, types: toggle(filters.types, type) })}>{PROPERTY_TYPES[type]}</button>
                  ))}
                </div>
              </div>
            )}
            <p className="opScopeLine">
              Showing <strong>{range.label}</strong> ({range.start} → {range.end}) for <strong>{scopedHomes.length}</strong> of {data.homes.length} properties.
              {(filters.homeIds.length || filters.types.length) ? <button type="button" className="opTextBtn" onClick={() => setFilters({ ...filters, homeIds: [], types: [] })}>Clear property filters</button> : null}
            </p>
          </section>

          <section className="opAsk" aria-label="Ask about your portfolio">
            <form onSubmit={(event) => void ask(event)}>
              <label htmlFor="ownerAsk">Ask for a number</label>
              <div className="opAskRow">
                <input id="ownerAsk" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="e.g. “Maintenance per door for my condos last quarter”" disabled={asking} />
                <button type="submit" className="opBtn primary" disabled={asking || !prompt.trim()}>{asking ? "Working…" : "Calculate"}</button>
              </div>
            </form>
            <div className="opSuggestions">
              {SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" className="opChip" onClick={() => void ask(undefined, suggestion)} disabled={asking}>{suggestion}</button>)}
            </div>
            {!data.aiConfigured && <p className="opHint">Natural-language AI is not configured. Requests are interpreted locally; phrases like “per door”, “as a percent of income”, and “months of reserves” work well.</p>}
            {askError && <div className="opNotice error">{askError}</div>}
            {asks.length > 0 && (
              <div className="opAskResults">
                {asks.map((item) => {
                  const evaluation = evaluateMetric(item.definition, { owner: data.owner, homes: data.homes, entries: data.entries, maintenance: data.maintenance, filters });
                  return (
                    <div key={item.id} className="opAskResult">
                      <div className="opAskValue">
                        <span>{item.definition.title}</span>
                        <strong>{evaluation.result.ok ? formatMetric(evaluation.result.value, item.definition.format) : "—"}</strong>
                        <small>{evaluation.range.label} · {scopeLabel(evaluation.homes.length, data.homes.length)}</small>
                      </div>
                      <div className="opAskBody">
                        <p>{evaluation.result.ok ? item.definition.explanation : evaluation.result.error}</p>
                        <code>{item.definition.expression}</code>
                        {item.note && <small className="opHint">{item.note}</small>}
                        <div className="opAskActions">
                          {item.pinnedId ? <span className="opPinned">Pinned to dashboard</span> : <button type="button" className="opBtn small" onClick={() => void pin(item)}>Pin to dashboard</button>}
                          <button type="button" className="opTextBtn" onClick={() => setAsks((current) => current.filter((ask) => ask.id !== item.id))}>Dismiss</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {arrange && (
            <div className="opArrangeBar">
              <div>
                <strong>Arrange your dashboard.</strong> Drag the handle (or use the arrows) to reorder, change card sizes, or hide cards. Changes save automatically{saving ? ` · ${saving === "saving" ? "saving…" : saving === "saved" ? "saved" : "save failed"}` : ""}.
              </div>
              <div className="opArrangeTools">
                {hiddenItems.length > 0 && (
                  <select aria-label="Show a hidden card" value="" onChange={(event) => { if (event.target.value) persistLayout({ ...layout, hidden: layout.hidden.filter((id) => id !== event.target.value) }); }}>
                    <option value="">Show hidden card…</option>
                    {hiddenItems.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                  </select>
                )}
                <button type="button" className="opTextBtn" onClick={() => persistLayout(defaultLayout(data.customMetrics))}>Reset layout</button>
              </div>
            </div>
          )}

          <OwnerDashboardGrid
            items={items}
            arrange={arrange}
            renderItem={renderWidget}
            onReorder={(order) => persistLayout({ ...layout, order: [...order, ...layout.order.filter((id) => !order.includes(id))] })}
            onHide={(id) => persistLayout({ ...layout, hidden: [...layout.hidden, id] })}
            onResize={(id, size: WidgetSize) => persistLayout({ ...layout, sizes: { ...(layout.sizes || {}), [id]: size } })}
          />

          <footer className="opFoot">
            Figures come from the books your manager keeps in HomeOps: rent posts when collected, bills post when paid. Security deposits are held for tenants and are not counted as your income. {data.owner.managerName ? `Managed by ${data.owner.managerName}.` : ""}
          </footer>
        </div>
      )}
    </main>
  );
}

function safeParse(value: string | null): DashboardLayout | null {
  if (!value) return null;
  try { return JSON.parse(value) as DashboardLayout; } catch { return null; }
}

function scopeLabel(count: number, total: number) {
  if (count === total) return `all ${total} properties`;
  return `${count} of ${total} properties`;
}

function ordinal(day: number) {
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return `${day}${suffix}`;
}
