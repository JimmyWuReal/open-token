import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { breakdown, dailyProviderTotals, dailyTotals, formatCurrency, formatNumber, formatTokens, lastDays, lastDaysByProvider, lifetime, longestStreak, providerOrder } from "./analytics";
import type { DayProviderTotal, DayTotal, GroupStat } from "./analytics";
import { loadCollectionStatus, loadPayload, requestCollectionRefresh } from "./data";
import type { CollectionStatus, DataPayload, TokenEvent } from "./types";

const TABS = ["Overview", "Days", "Provider", "Model"] as const;
type Tab = (typeof TABS)[number];
type HeatMode = "tokens" | "cost";
type Metric = "tokens" | "cost";

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
          showTip={showTip}
          hideTip={hideTip}
        />
      ) : tab === "Days" ? (
        <DaysPage events={events} showTip={showTip} hideTip={hideTip} />
      ) : tab === "Provider" ? (
        <BreakdownPage key="provider" events={events} groupKey="provider" title="Providers" subjectLabel="provider" showTip={showTip} hideTip={hideTip} />
      ) : (
        <BreakdownPage key="model" events={events} groupKey="model" title="Models" subjectLabel="model" showTip={showTip} hideTip={hideTip} />
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
  showTip,
  hideTip
}: {
  lifetimeTokens: number;
  lifetimeCost: number;
  streak: number;
  year: DayTotal[];
  month: DayProviderTotal[];
  showTip: (event: { clientX: number; clientY: number }, title: string, detail: string) => void;
  hideTip: () => void;
}) {
  const [heatMode, setHeatMode] = useState<HeatMode>("tokens");
  const [chartMetric, setChartMetric] = useState<Metric>("tokens");
  const chartProviders = useMemo(() => providerOrder(month, chartMetric), [month, chartMetric]);

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

      <section className="card" aria-label={`${chartMetric === "cost" ? "Cost" : "Tokens"} over the last 30 days`}>
        <div className="card-head">
          <h2>{chartMetric === "cost" ? "Cost" : "Tokens"} · last 30 days</h2>
          <div className="segmented" role="group" aria-label="Chart metric">
            <button type="button" className={chartMetric === "tokens" ? "seg active" : "seg"} onClick={() => setChartMetric("tokens")}>Tokens</button>
            <button type="button" className={chartMetric === "cost" ? "seg active" : "seg"} onClick={() => setChartMetric("cost")}>Cost</button>
          </div>
        </div>
        <DailyChart days={month} providers={chartProviders} metric={chartMetric} showTip={showTip} hideTip={hideTip} />
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

function providerValue(day: DayProviderTotal, provider: string, metric: Metric) {
  const source = metric === "cost" ? day.costByProvider : day.byProvider;
  return source[provider] || 0;
}

function dayMetric(day: DayProviderTotal, metric: Metric) {
  return metric === "cost" ? day.cost : day.tokens;
}

function formatMetric(value: number, metric: Metric) {
  return metric === "cost" ? formatCurrency(value) : `${formatTokens(value)} tokens`;
}

function DailyChart({ days, providers, metric, showTip, hideTip }: { days: DayProviderTotal[]; providers: string[]; metric: Metric; showTip: (event: { clientX: number; clientY: number }, title: string, detail: string) => void; hideTip: () => void }) {
  const max = useMemo(() => Math.max(Number.EPSILON, ...days.map((day) => dayMetric(day, metric))), [days, metric]);

  return (
    <div className="bar-chart">
      <div className="bars-row">
        {days.map((day) => {
          const total = dayMetric(day, metric);
          const height = total > 0 ? Math.max(2, (total / max) * 100) : 0;
          return (
            <div className="bar-col" key={day.date}>
              <div className="bar-stack" style={{ height: `${height}%` }}>
                {providers.map((provider, index) => {
                  const value = providerValue(day, provider, metric);
                  if (value <= 0) return null;
                  const detail = `${provider} · ${formatMetric(value, metric)}`;
                  return (
                    <div
                      key={provider}
                      className={`bar-seg ${seriesClass(index)}`}
                      style={{ height: `${(value / total) * 100}%` }}
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

type TipHandlers = {
  showTip: (event: { clientX: number; clientY: number }, title: string, detail: string) => void;
  hideTip: () => void;
};

function MetricToggle({ metric, onChange }: { metric: Metric; onChange: (metric: Metric) => void }) {
  return (
    <div className="segmented" role="group" aria-label="Metric">
      <button type="button" className={metric === "tokens" ? "seg active" : "seg"} onClick={() => onChange("tokens")}>Tokens</button>
      <button type="button" className={metric === "cost" ? "seg active" : "seg"} onClick={() => onChange("cost")}>Cost</button>
    </div>
  );
}

function shortDay(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function weekday(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" });
}

function topProvider(day: DayProviderTotal, metric: Metric) {
  const source = metric === "cost" ? day.costByProvider : day.byProvider;
  let name = "";
  let best = -1;
  for (const [provider, value] of Object.entries(source)) {
    if (value > best) { best = value; name = provider; }
  }
  return name || "—";
}

function DaysPage({ events, showTip, hideTip }: TipHandlers & { events: TokenEvent[] }) {
  const [metric, setMetric] = useState<Metric>("tokens");
  const providerTotals = useMemo(() => dailyProviderTotals(events), [events]);
  const days = useMemo(() => lastDaysByProvider(providerTotals, 30).slice().reverse(), [providerTotals]);

  const valueOf = (day: DayProviderTotal) => (metric === "cost" ? day.cost : day.tokens);
  const fmt = (value: number) => (metric === "cost" ? formatCurrency(value) : formatTokens(value));
  const active = days.filter((day) => day.tokens > 0);
  const max = Math.max(Number.EPSILON, ...days.map(valueOf));
  const windowTotal = days.reduce((sum, day) => sum + valueOf(day), 0);
  const average = active.length ? windowTotal / active.length : 0;
  const busiest = active.reduce<DayProviderTotal | null>((best, day) => (!best || valueOf(day) > valueOf(best) ? day : best), null);

  return (
    <>
      <section className="stats" aria-label="Last 30 days summary">
        <Stat label="Active days" value={`${active.length} / 30`} detail="Days with activity" />
        <Stat label={metric === "cost" ? "Busiest day spend" : "Busiest day"} value={busiest ? fmt(valueOf(busiest)) : "—"} detail={busiest ? shortDay(busiest.date) : "No activity"} />
        <Stat label="Daily average" value={fmt(average)} detail="Per active day" />
      </section>

      <section className="card" aria-label="Daily breakdown">
        <div className="card-head">
          <h2>Daily breakdown · last 30 days</h2>
          <MetricToggle metric={metric} onChange={setMetric} />
        </div>
        {active.length ? (
          <table className="day-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Top provider</th>
                <th>{metric === "cost" ? "Cost" : "Tokens"}</th>
                <th className="day-bar-cell" aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {days.map((day) => {
                const value = valueOf(day);
                const width = value > 0 ? Math.max(6, (value / max) * 100) : 0;
                const top = topProvider(day, metric);
                const detail = `${formatTokens(day.tokens)} tokens · ${formatCurrency(day.cost)} · top ${top}`;
                return (
                  <tr
                    className="day-row"
                    key={day.date}
                    onMouseEnter={(event) => showTip(event, fmtDay(day.date), detail)}
                    onMouseMove={(event) => showTip(event, fmtDay(day.date), detail)}
                    onMouseLeave={hideTip}
                  >
                    <td>
                      <span className="day-date">
                        <b>{shortDay(day.date)}</b>
                        <small>{weekday(day.date)}</small>
                      </span>
                    </td>
                    <td className="day-top">{value > 0 ? top : "—"}</td>
                    <td><span className="day-val">{value > 0 ? fmt(value) : "—"}</span></td>
                    <td className="day-bar-cell">
                      <div className="day-track"><div className="day-fill" style={{ width: `${width}%` }} /></div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="empty-note">No activity recorded in the last 30 days.</p>
        )}
      </section>
    </>
  );
}

function BreakdownPage({ events, groupKey, title, subjectLabel, showTip, hideTip }: TipHandlers & { events: TokenEvent[]; groupKey: "provider" | "model"; title: string; subjectLabel: string }) {
  const [metric, setMetric] = useState<Metric>("tokens");
  const stats = useMemo(() => breakdown(events, groupKey), [events, groupKey]);
  const valueOf = (stat: GroupStat) => (metric === "cost" ? stat.cost : stat.tokens);
  const sorted = useMemo(() => stats.slice().sort((a, b) => (metric === "cost" ? b.cost - a.cost : b.tokens - a.tokens)), [stats, metric]);
  const fmt = (value: number) => (metric === "cost" ? formatCurrency(value) : formatTokens(value));

  const total = sorted.reduce((sum, stat) => sum + valueOf(stat), 0);
  const max = Math.max(Number.EPSILON, ...sorted.map(valueOf));
  const lifetimeTotal = stats.reduce((acc, stat) => ({ tokens: acc.tokens + stat.tokens, cost: acc.cost + stat.cost }), { tokens: 0, cost: 0 });
  const top = sorted[0];

  return (
    <>
      <section className="stats" aria-label={`${title} summary`}>
        <Stat label={title} value={formatNumber(stats.length)} detail={`Distinct ${subjectLabel}s`} />
        <Stat label={`Top ${subjectLabel}`} value={top ? top.name : "—"} detail={top ? `${formatTokens(top.tokens)} tokens` : "No activity"} />
        <Stat label={metric === "cost" ? "Total cost" : "Total tokens"} value={metric === "cost" ? formatCurrency(lifetimeTotal.cost) : formatTokens(lifetimeTotal.tokens)} detail="All recorded sessions" />
      </section>

      <section className="card" aria-label={`${title} breakdown`}>
        <div className="card-head">
          <h2>{title} by {metric === "cost" ? "cost" : "tokens"}</h2>
          <MetricToggle metric={metric} onChange={setMetric} />
        </div>
        {sorted.length ? (
          <div className="rank-list">
            {sorted.map((stat, index) => {
              const value = valueOf(stat);
              const width = value > 0 ? Math.max(6, (value / max) * 100) : 0;
              const share = total > 0 ? Math.round((value / total) * 100) : 0;
              const detail = `${formatTokens(stat.tokens)} tokens · ${formatCurrency(stat.cost)} · ${formatNumber(stat.requests)} requests`;
              return (
                <div
                  className="rank-item"
                  key={stat.name}
                  onMouseEnter={(event) => showTip(event, stat.name, detail)}
                  onMouseMove={(event) => showTip(event, stat.name, detail)}
                  onMouseLeave={hideTip}
                >
                  <div className="rank-head">
                    <div className="rank-label">
                      <span className="rank-name"><span className="rank-rank">{index + 1}</span>{stat.name}</span>
                      {stat.provider ? <span className="rank-sub">{stat.provider}</span> : null}
                    </div>
                    <div className="rank-figs">
                      <span className="rank-value">{fmt(value)}</span>
                      <span className="rank-share">{share}%</span>
                    </div>
                  </div>
                  <div className="rank-track"><div className="rank-fill" style={{ width: `${width}%` }} /></div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="empty-note">No {subjectLabel} activity recorded.</p>
        )}
      </section>
    </>
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
