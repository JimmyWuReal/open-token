import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { all, filterEvents, formatCurrency, formatNumber, group, options, summarize, timeline, tokens } from "./analytics";
import { loadPayload } from "./data";
import type { DataPayload, Filters, TokenEvent } from "./types";

const initialFilters: Filters = { range: "7d", provider: all, model: all, tool: all };

export default function App() {
  const [payload, setPayload] = useState<DataPayload | null>(null);
  const [isLocal, setIsLocal] = useState(false);
  const [filters, setFilters] = useState<Filters>(initialFilters);

  useEffect(() => {
    loadPayload().then(({ payload, local }) => {
      setPayload(payload);
      setIsLocal(local);
    });
  }, []);

  const events = payload?.events ?? [];
  const filtered = useMemo(() => filterEvents(events, filters), [events, filters]);
  const summary = useMemo(() => summarize(filtered), [filtered]);
  const providerRows = useMemo(() => group(filtered, "provider", "cost"), [filtered]);
  const modelRows = useMemo(() => group(filtered, "model", "tokens").slice(0, 8), [filtered]);
  const series = useMemo(() => timeline(filtered), [filtered]);
  const recent = useMemo(() => [...filtered].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 10), [filtered]);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{isLocal ? "Local computer data" : "Demo data"} {payload?.generatedAt ? `updated ${new Date(payload.generatedAt).toLocaleTimeString()}` : ""}</p>
          <h1>Open Token</h1>
          <p className="subhead">Fast token, cost, latency, provider, and model analytics from local AI development sessions.</p>
        </div>
        <button onClick={() => window.location.reload()} type="button">Reload</button>
      </header>

      <section className="metrics" aria-label="Token analytics summary">
        <Metric label="Cost" value={formatCurrency(summary.cost)} detail={`${formatNumber(filtered.length)} events`} />
        <Metric label="Tokens" value={formatNumber(summary.tokens)} detail={`${formatNumber(summary.requests)} requests`} />
        <Metric label="Latency" value={`${formatNumber(summary.latency)} ms`} detail="Average response" />
        <Metric label="Success" value={`${summary.successRate}%`} detail="Filtered events" />
      </section>

      <section className="filters" aria-label="Filters">
        <Select label="Range" value={filters.range} options={["24h", "7d", "30d", "all"]} onChange={(range) => setFilters({ ...filters, range: range as Filters["range"] })} />
        <Select label="Provider" value={filters.provider} options={options(events, "provider")} onChange={(provider) => setFilters({ ...filters, provider })} />
        <Select label="Model" value={filters.model} options={options(events, "model")} onChange={(model) => setFilters({ ...filters, model })} />
        <Select label="Tool" value={filters.tool} options={options(events, "tool")} onChange={(tool) => setFilters({ ...filters, tool })} />
      </section>

      <section className="grid">
        <Panel title="Token timeline" wide>
          <Timeline rows={series} />
        </Panel>
        <Panel title="Provider spend">
          <Bars rows={providerRows} format={formatCurrency} />
        </Panel>
        <Panel title="Top models" wide>
          <Bars rows={modelRows} format={formatNumber} />
        </Panel>
        <Panel title="Sources">
          <div className="source-list">
            <b>{formatNumber(payload?.totalEvents ?? 0)}</b>
            <span>events collected</span>
            {(payload?.scannedPaths.length ? payload.scannedPaths : ["Run `open-token` to scan Codex, Claude Code, or imported JSON metrics."]).map((source) => <code key={source}>{source}</code>)}
          </div>
        </Panel>
      </section>

      <section className="events">
        <div className="section-heading">
          <h2>Recent events</h2>
          <span>{isLocal ? "Sanitized metadata only" : "Seeded sample"}</span>
        </div>
        <div className="table" role="table">
          {recent.map((event) => <EventRow key={event.id} event={event} />)}
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function Panel({ title, wide, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return <section className={wide ? "panel wide" : "panel"}><h2>{title}</h2>{children}</section>;
}

function Timeline({ rows }: { rows: Array<[string, { tokens: number; cost: number }]> }) {
  const max = Math.max(1, ...rows.map(([, value]) => value.tokens));
  const points = rows.map(([, value], index) => `${(index / Math.max(1, rows.length - 1)) * 100},${100 - (value.tokens / max) * 88}`).join(" ");
  return <div className="chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points={points} /></svg><div className="axis">{rows.map(([day]) => <span key={day}>{day.slice(5)}</span>)}</div></div>;
}

function Bars({ rows, format }: { rows: Array<[string, number]>; format: (value: number) => string }) {
  const max = Math.max(1, ...rows.map(([, value]) => value));
  return <div className="bars">{rows.map(([name, value]) => <div className="bar-row" key={name}><span>{name}</span><div><i style={{ width: `${Math.max(4, (value / max) * 100)}%` }} /></div><b>{format(value)}</b></div>)}</div>;
}

function EventRow({ event }: { event: TokenEvent }) {
  return <div className="event-row" role="row"><span>{new Date(event.timestamp).toLocaleString()}</span><b>{event.provider}</b><span>{event.model}</span><span>{formatNumber(tokens(event))} tok</span><span>{formatCurrency(event.costUsd)}</span></div>;
}
