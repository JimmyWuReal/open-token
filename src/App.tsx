import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { dailyTotals, formatCurrency, formatNumber, formatTokens, lastDays, lifetime, longestStreak } from "./analytics";
import type { DayTotal } from "./analytics";
import { loadCollectionStatus, loadPayload, requestCollectionRefresh } from "./data";
import type { CollectionStatus, DataPayload } from "./types";

const TABS = ["Overview", "Sessions", "Models", "Settings"] as const;
type Tab = (typeof TABS)[number];
type HeatMode = "tokens" | "cost";

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
  const month = useMemo(() => lastDays(totals, 30), [totals]);

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
  showTip,
  hideTip
}: {
  lifetimeTokens: number;
  lifetimeCost: number;
  streak: number;
  year: DayTotal[];
  month: DayTotal[];
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
        <DailyChart days={month} showTip={showTip} hideTip={hideTip} />
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

function DailyChart({ days, showTip, hideTip }: { days: DayTotal[]; showTip: (event: { clientX: number; clientY: number }, title: string, detail: string) => void; hideTip: () => void }) {
  const max = useMemo(() => Math.max(1, ...days.map((day) => day.tokens)), [days]);

  return (
    <div className="bar-chart">
      <div className="bars-row">
        {days.map((day) => {
          const height = day.tokens > 0 ? Math.max(2, (day.tokens / max) * 100) : 0;
          const detail = day.tokens > 0 ? `${formatTokens(day.tokens)} tokens` : "No activity";
          return (
            <div
              className="bar-col"
              key={day.date}
              onMouseEnter={(event) => showTip(event, fmtDay(day.date), detail)}
              onMouseMove={(event) => showTip(event, fmtDay(day.date), detail)}
              onMouseLeave={hideTip}
            >
              <div className="bar-fill" style={{ height: `${height}%` }} />
            </div>
          );
        })}
      </div>
      <div className="bar-axis">
        <span>{days.length ? fmtDay(days[0].date) : ""}</span>
        <span>{days.length ? fmtDay(days[days.length - 1].date) : ""}</span>
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
