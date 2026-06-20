import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { dailyProviderTotals, dailyTotals, formatCurrency, formatNumber, formatTokens, lastDays, lastDaysByProvider, lifetime, longestStreak, providerOrder } from "./analytics";
import type { DayProviderTotal, DayTotal, ProviderTotals } from "./analytics";
import { loadCollectionStatus, loadPayload, requestCollectionRefresh } from "./data";
import type { CollectionStatus, DataPayload } from "./types";

const TABS = ["Overview", "Provider", "Models", "Settings"] as const;
type Tab = (typeof TABS)[number];
type HeatMode = "tokens" | "cost";
type Metric = "tokens" | "cost";
type ChartView = "value" | "share";
type DayRange = 14 | 30;

type TipState = { x: number; y: number; title: string; detail: string } | null;

export default function App() {
  const [payload, setPayload] = useState<DataPayload | null>(null);
  const [isLocal, setIsLocal] = useState(false);
  const [collectionStatus, setCollectionStatus] = useState<CollectionStatus | null>(null);
  const [autoReload, setAutoReload] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [tab, setTab] = useState<Tab>("Overview");
  const [tip, setTip] = useState<TipState>(null);
  const lastLoadedGeneratedAt = useRef("");

  const refreshPayload = useCallback(async () => {
    const { payload, local } = await loadPayload();
    setPayload(payload);
    setIsLocal(local);
    lastLoadedGeneratedAt.current = payload.generatedAt;
  }, []);

  useEffect(() => {
    refreshPayload();
  }, [refreshPayload]);

  const reloadDashboard = useCallback(async () => {
    setIsReloading(true);
    try {
      const collectionStarted = await requestCollectionRefresh();
      if (!collectionStarted) await refreshPayload();
      const status = await loadCollectionStatus();
      setCollectionStatus(status);
    } finally {
      setIsReloading(false);
    }
  }, [refreshPayload]);

  useEffect(() => {
    if (!autoReload) return;
    const interval = window.setInterval(() => {
      void reloadDashboard();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [autoReload, reloadDashboard]);

  useEffect(() => {
    let cancelled = false;

    async function refreshStatus() {
      const status = await loadCollectionStatus();
      if (cancelled) return;
      setCollectionStatus(status);
      if (status?.state === "done" && status.generatedAt && status.generatedAt !== lastLoadedGeneratedAt.current) {
        await refreshPayload();
      }
    }

    refreshStatus();
    const interval = window.setInterval(refreshStatus, 900);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshPayload]);

  const events = payload?.events ?? [];
  const totals = useMemo(() => dailyTotals(events), [events]);
  const totalsLifetime = useMemo(() => lifetime(events), [events]);
  const streak = useMemo(() => longestStreak(totals), [totals]);
  const year = useMemo(() => lastDays(totals, 365), [totals]);
  const providerTotals = useMemo(() => dailyProviderTotals(events), [events]);
  const month = useMemo(() => lastDaysByProvider(providerTotals, 30), [providerTotals]);
  const providers = useMemo(() => providerOrder(month), [month]);

  const showTip = useCallback((event: { clientX: number; clientY: number }, title: string, detail: string) => {
    setTip({ x: event.clientX, y: event.clientY, title, detail });
  }, []);
  const hideTip = useCallback(() => setTip(null), []);

  return (
    <main className="shell">
      <header className="profile">
        <div className="avatar" aria-hidden="true">JW</div>
        <div className="profile-id">
          <h1>Jordan Walters</h1>
        </div>
        <div className="profile-actions">
          <label className="toggle-control">
            <input type="checkbox" checked={autoReload} onChange={(event) => setAutoReload(event.target.checked)} />
            <span>Auto reload 60s</span>
          </label>
          <button onClick={() => void reloadDashboard()} disabled={isReloading} type="button">{isReloading ? "Reloading" : "Reload"}</button>
        </div>
      </header>

      <nav className="tabs" aria-label="Sections">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            className={tab === name ? "tab active" : "tab"}
            aria-current={tab === name ? "page" : undefined}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </nav>

      <CollectionProgress status={collectionStatus} local={isLocal} />

      {tab === "Overview" ? (
        <Overview
          lifetimeTokens={totalsLifetime.tokens}
          lifetimeCost={totalsLifetime.cost}
          streak={streak}
          year={year}
          month={month}
          providers={providers}
          showTip={showTip}
          hideTip={hideTip}
        />
      ) : tab === "Provider" ? (
        <Provider providerTotals={providerTotals} showTip={showTip} hideTip={hideTip} />
      ) : (
        <Placeholder name={tab} />
      )}

      {tip ? (
        <div className="tooltip" style={{ left: tip.x, top: tip.y }} role="status">
          <strong>{tip.title}</strong>
          <span>{tip.detail}</span>
        </div>
      ) : null}
    </main>
  );
}

function Overview({
  lifetimeTokens,
  lifetimeCost,
  streak,
  year,
  month,
  providers,
  showTip,
  hideTip
}: {
  lifetimeTokens: number;
  lifetimeCost: number;
  streak: number;
  year: DayTotal[];
  month: DayProviderTotal[];
  providers: string[];
  showTip: (event: { clientX: number; clientY: number }, title: string, detail: string) => void;
  hideTip: () => void;
}) {
  const [heatMode, setHeatMode] = useState<HeatMode>("tokens");

  return (
    <>
      <section className="stats" aria-label="Lifetime totals">
        <Stat label="Lifetime tokens" value={formatTokens(lifetimeTokens)} detail="All recorded sessions" />
        <Stat label="Lifetime cost" value={formatCurrency(lifetimeCost)} detail="Estimated spend" />
        <Stat label="Longest streak" value={`${formatNumber(streak)} ${streak === 1 ? "day" : "days"}`} detail="Consecutive active days" />
      </section>

      <section className="card heatmap-card" aria-label="Daily activity">
        <div className="card-head">
          <h2>Activity · last 365 days</h2>
          <div className="segmented" role="group" aria-label="Heatmap metric">
            <button type="button" className={heatMode === "tokens" ? "seg active" : "seg"} onClick={() => setHeatMode("tokens")}>Tokens</button>
            <button type="button" className={heatMode === "cost" ? "seg active" : "seg"} onClick={() => setHeatMode("cost")}>Cost</button>
          </div>
        </div>
        <Heatmap days={year} mode={heatMode} showTip={showTip} hideTip={hideTip} />
      </section>

      <section className="card" aria-label="Tokens over the last 30 days">
        <div className="card-head">
          <h2>Tokens · last 30 days</h2>
        </div>
        <DailyChart days={month} providers={providers} showTip={showTip} hideTip={hideTip} />
      </section>
    </>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

function fmtDay(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function heatLevel(value: number, max: number) {
  if (value <= 0 || max <= 0) return 0;
  const ratio = value / max;
  if (ratio > 0.66) return 4;
  if (ratio > 0.4) return 3;
  if (ratio > 0.15) return 2;
  return 1;
}

function Heatmap({ days, mode, showTip, hideTip }: { days: DayTotal[]; mode: HeatMode; showTip: (event: { clientX: number; clientY: number }, title: string, detail: string) => void; hideTip: () => void }) {
  const max = useMemo(() => Math.max(0, ...days.map((day) => (mode === "tokens" ? day.tokens : day.cost))), [days, mode]);

  const weeks = useMemo(() => {
    const offset = days.length ? new Date(`${days[0].date}T00:00:00Z`).getUTCDay() : 0;
    const cells: Array<DayTotal | null> = [...Array<null>(offset).fill(null), ...days];
    const columns: Array<Array<DayTotal | null>> = [];
    for (let i = 0; i < cells.length; i += 7) columns.push(cells.slice(i, i + 7));
    return columns;
  }, [days]);

  let lastMonth = -1;

  return (
    <div className="heatmap-scroll">
      <div className="heatmap-grid">
        <div className="heatmap-months">
          <span className="heatmap-gutter" />
          {weeks.map((week, index) => {
            const firstDay = week.find(Boolean) as DayTotal | undefined;
            const monthIndex = firstDay ? new Date(`${firstDay.date}T00:00:00Z`).getUTCMonth() : -1;
            const show = monthIndex !== -1 && monthIndex !== lastMonth;
            if (show) lastMonth = monthIndex;
            return <span key={index}>{show ? MONTHS[monthIndex] : ""}</span>;
          })}
        </div>
        <div className="heatmap-body">
          <div className="heatmap-weekdays">
            {WEEKDAY_LABELS.map((label, index) => <span key={index}>{label}</span>)}
          </div>
          {weeks.map((week, index) => (
            <div className="heatmap-col" key={index}>
              {Array.from({ length: 7 }, (_, row) => {
                const day = week[row];
                if (!day) return <span className="cell empty" key={row} />;
                const value = mode === "tokens" ? day.tokens : day.cost;
                const detail = value > 0
                  ? `${mode === "tokens" ? formatTokens(day.tokens) + " tokens" : formatCurrency(day.cost)}`
                  : "No activity";
                return (
                  <span
                    key={row}
                    className={`cell l${heatLevel(value, max)}`}
                    onMouseEnter={(event) => showTip(event, fmtDay(day.date), detail)}
                    onMouseMove={(event) => showTip(event, fmtDay(day.date), detail)}
                    onMouseLeave={hideTip}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="heatmap-legend">
        <span>Less</span>
        <i className="cell l0" />
        <i className="cell l1" />
        <i className="cell l2" />
        <i className="cell l3" />
        <i className="cell l4" />
        <span>More</span>
      </div>
    </div>
  );
}

function seriesClass(index: number) {
  return `series-${Math.min(index, 5)}`;
}

function DailyChart({ days, providers, showTip, hideTip }: { days: DayProviderTotal[]; providers: string[]; showTip: (event: { clientX: number; clientY: number }, title: string, detail: string) => void; hideTip: () => void }) {
  const maxTokens = useMemo(() => Math.max(1, ...days.map((day) => day.tokens)), [days]);
  const maxCost = useMemo(() => Math.max(Number.EPSILON, ...days.map((day) => day.cost)), [days]);
  const count = days.length || 1;
  const costY = (cost: number) => (1 - cost / maxCost) * 100;
  const costX = (index: number) => ((index + 0.5) / count) * 100;
  const linePoints = days.map((day, index) => `${costX(index)},${costY(day.cost)}`).join(" ");

  return (
    <div className="combo-chart">
      <div className="plot">
        <div className="bars-row">
          {days.map((day) => {
            const height = day.tokens > 0 ? Math.max(2, (day.tokens / maxTokens) * 100) : 0;
            return (
              <div className="bar-col" key={day.date}>
                <div className="bar-stack" style={{ height: `${height}%` }}>
                  {providers.map((provider, index) => {
                    const value = day.byProvider[provider] || 0;
                    if (value <= 0) return null;
                    const detail = `${provider} · ${formatTokens(value)} tokens`;
                    return (
                      <div
                        key={provider}
                        className={`bar-seg ${seriesClass(index)}`}
                        style={{ height: `${(value / day.tokens) * 100}%` }}
                        onMouseEnter={(event) => showTip(event, fmtDay(day.date), detail)}
                        onMouseMove={(event) => showTip(event, fmtDay(day.date), detail)}
                        onMouseLeave={hideTip}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <svg className="cost-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline points={linePoints} />
        </svg>
        <div className="cost-dots">
          {days.map((day, index) => (
            <span
              key={day.date}
              className="cost-dot"
              style={{ left: `${costX(index)}%`, top: `${costY(day.cost)}%` }}
              onMouseEnter={(event) => showTip(event, fmtDay(day.date), `${formatCurrency(day.cost)} cost`)}
              onMouseMove={(event) => showTip(event, fmtDay(day.date), `${formatCurrency(day.cost)} cost`)}
              onMouseLeave={hideTip}
            />
          ))}
        </div>
      </div>
      <div className="bar-axis">
        <span>{days.length ? fmtDay(days[0].date) : ""}</span>
        <span>{days.length ? fmtDay(days[days.length - 1].date) : ""}</span>
      </div>
      <div className="chart-legend">
        {providers.map((provider, index) => (
          <span className="legend-item" key={provider}>
            <i className={`swatch ${seriesClass(index)}`} />{provider}
          </span>
        ))}
        <span className="legend-item"><i className="swatch cost-swatch" />Cost</span>
      </div>
    </div>
  );
}

type Tip = (event: { clientX: number; clientY: number }, title: string, detail: string) => void;

function formatMetric(value: number, metric: Metric) {
  return metric === "cost" ? formatCurrency(value) : `${formatTokens(value)} tokens`;
}

function Provider({ providerTotals, showTip, hideTip }: { providerTotals: ProviderTotals; showTip: Tip; hideTip: () => void }) {
  const [range, setRange] = useState<DayRange>(30);
  const [metric, setMetric] = useState<Metric>("tokens");
  const [view, setView] = useState<ChartView>("value");

  const days = useMemo(() => lastDaysByProvider(providerTotals, range), [providerTotals, range]);
  const providers = useMemo(() => providerOrder(days, metric), [days, metric]);

  const metricLabel = metric === "cost" ? "Cost" : "Tokens";

  return (
    <>
      <section className="card" aria-label="Provider share">
        <div className="card-head">
          <h2>Provider share · {metricLabel.toLowerCase()} · last {range} days</h2>
          <div className="segmented" role="group" aria-label="Share metric">
            <button type="button" className={metric === "tokens" ? "seg active" : "seg"} onClick={() => setMetric("tokens")}>Tokens</button>
            <button type="button" className={metric === "cost" ? "seg active" : "seg"} onClick={() => setMetric("cost")}>Cost</button>
          </div>
        </div>
        <ShareBar days={days} providers={providers} metric={metric} showTip={showTip} hideTip={hideTip} />
      </section>

      <section className="card" aria-label="Provider breakdown over time">
        <div className="card-head">
          <h2>{metricLabel} by provider · last {range} days</h2>
          <div className="card-controls">
            <div className="segmented" role="group" aria-label="Day range">
              <button type="button" className={range === 14 ? "seg active" : "seg"} onClick={() => setRange(14)}>14d</button>
              <button type="button" className={range === 30 ? "seg active" : "seg"} onClick={() => setRange(30)}>30d</button>
            </div>
            <div className="segmented" role="group" aria-label="Chart metric">
              <button type="button" className={metric === "tokens" ? "seg active" : "seg"} onClick={() => setMetric("tokens")}>Tokens</button>
              <button type="button" className={metric === "cost" ? "seg active" : "seg"} onClick={() => setMetric("cost")}>Cost</button>
            </div>
            <div className="segmented" role="group" aria-label="Chart view">
              <button type="button" className={view === "value" ? "seg active" : "seg"} onClick={() => setView("value")}>Value</button>
              <button type="button" className={view === "share" ? "seg active" : "seg"} onClick={() => setView("share")}>Percent</button>
            </div>
          </div>
        </div>
        <ProviderChart days={days} providers={providers} metric={metric} view={view} showTip={showTip} hideTip={hideTip} />
      </section>
    </>
  );
}

function dayMetric(day: DayProviderTotal, metric: Metric) {
  return metric === "cost" ? day.cost : day.tokens;
}

function providerValue(day: DayProviderTotal, provider: string, metric: Metric) {
  const source = metric === "cost" ? day.costByProvider : day.byProvider;
  return source[provider] || 0;
}

function ShareBar({ days, providers, metric, showTip, hideTip }: { days: DayProviderTotal[]; providers: string[]; metric: Metric; showTip: Tip; hideTip: () => void }) {
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const day of days) {
      for (const provider of providers) map.set(provider, (map.get(provider) || 0) + providerValue(day, provider, metric));
    }
    return map;
  }, [days, providers, metric]);
  const grand = useMemo(() => Array.from(totals.values()).reduce((acc, value) => acc + value, 0), [totals]);

  if (grand <= 0) return <p className="empty-note">No activity in this range.</p>;

  return (
    <div className="share">
      <div className="share-bar" role="img" aria-label={`Provider ${metric} share`}>
        {providers.map((provider, index) => {
          const value = totals.get(provider) || 0;
          if (value <= 0) return null;
          const pct = (value / grand) * 100;
          const detail = `${formatMetric(value, metric)} · ${pct.toFixed(1)}%`;
          return (
            <div
              key={provider}
              className={`share-seg ${seriesClass(index)}`}
              style={{ width: `${pct}%` }}
              onMouseEnter={(event) => showTip(event, provider, detail)}
              onMouseMove={(event) => showTip(event, provider, detail)}
              onMouseLeave={hideTip}
            />
          );
        })}
      </div>
      <div className="chart-legend">
        {providers.map((provider, index) => {
          const value = totals.get(provider) || 0;
          if (value <= 0) return null;
          return (
            <span className="legend-item" key={provider}>
              <i className={`swatch ${seriesClass(index)}`} />{provider} · {((value / grand) * 100).toFixed(0)}%
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ProviderChart({ days, providers, metric, view, showTip, hideTip }: { days: DayProviderTotal[]; providers: string[]; metric: Metric; view: ChartView; showTip: Tip; hideTip: () => void }) {
  const max = useMemo(() => Math.max(Number.EPSILON, ...days.map((day) => dayMetric(day, metric))), [days, metric]);

  return (
    <div className="combo-chart">
      <div className="plot">
        <div className="bars-row">
          {days.map((day) => {
            const total = dayMetric(day, metric);
            const height = total <= 0 ? 0 : view === "share" ? 100 : Math.max(2, (total / max) * 100);
            return (
              <div className="bar-col" key={day.date}>
                <div className="bar-stack" style={{ height: `${height}%` }}>
                  {providers.map((provider, index) => {
                    const value = providerValue(day, provider, metric);
                    if (value <= 0) return null;
                    const pct = (value / total) * 100;
                    const detail = `${provider} · ${formatMetric(value, metric)} · ${pct.toFixed(0)}%`;
                    return (
                      <div
                        key={provider}
                        className={`bar-seg ${seriesClass(index)}`}
                        style={{ height: `${pct}%` }}
                        onMouseEnter={(event) => showTip(event, fmtDay(day.date), detail)}
                        onMouseMove={(event) => showTip(event, fmtDay(day.date), detail)}
                        onMouseLeave={hideTip}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="bar-axis">
        <span>{days.length ? fmtDay(days[0].date) : ""}</span>
        <span>{days.length ? fmtDay(days[days.length - 1].date) : ""}</span>
      </div>
      <div className="chart-legend">
        {providers.map((provider, index) => (
          <span className="legend-item" key={provider}>
            <i className={`swatch ${seriesClass(index)}`} />{provider}
          </span>
        ))}
      </div>
    </div>
  );
}

function Placeholder({ name }: { name: string }) {
  return (
    <section className="card placeholder">
      <h2>{name}</h2>
      <p>This section is a placeholder. Content coming soon.</p>
    </section>
  );
}

function CollectionProgress({ status, local }: { status: CollectionStatus | null; local: boolean }) {
  if (!status || status.state === "idle" || status.state === "done") return null;

  const progress = Math.max(0, Math.min(100, Math.round(status.progress || 0)));
  const fileText = status.filesDiscovered
    ? `${formatNumber(status.filesParsed)} of ${formatNumber(status.filesDiscovered)} files parsed`
    : `${formatNumber(status.rootsScanned)} of ${formatNumber(status.rootsTotal)} sources scanned`;

  if (status.state === "error") {
    return (
      <section className="collection-status error" aria-live="polite">
        <div className="collection-copy">
          <div>
            <span>Collection issue</span>
            <b>{status.error || status.message}</b>
          </div>
        </div>
        <div className="progress-wrap" aria-label="Collection progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} role="progressbar">
          <i style={{ width: `${progress}%` }} />
        </div>
      </section>
    );
  }

  return (
    <section className="loading-screen" aria-live="polite" aria-busy="true">
      <div className="loading-spinner" aria-hidden="true" />
      <b>{status.message || "Collecting local metadata"}</b>
      <p>{formatNumber(status.eventsCollected)} events found · {fileText}{local ? "" : " · showing demo data until local data is ready"}</p>
      <div className="progress-wrap" aria-label="Collection progress" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} role="progressbar">
        <i style={{ width: `${progress}%` }} />
      </div>
    </section>
  );
}
