import { useEffect, useMemo, useState } from "react";
import { Database, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import type { EChartsOption } from "echarts";
import { Chart } from "./components/Chart";
import { allValue, filterEvents, formatCurrency, formatNumber, getOptions, groupMetric, heatmap, summarize, timeseries, totalTokens } from "./lib/analytics";
import { loadEvents, loadLocalEvents, resetEvents, type EventDataSource } from "./lib/storage";
import type { Filters, TokenEvent } from "./types";

const initialFilters: Filters = {
  range: "14d",
  project: allValue,
  provider: allValue,
  model: allValue,
  deviceName: allValue,
  tool: allValue,
};

const chartText = "#4b5563";
const chartGrid = "#e5e7eb";
const accent = "#0f766e";

function App() {
  const [events, setEvents] = useState<TokenEvent[]>(() => loadEvents());
  const [dataSource, setDataSource] = useState<EventDataSource>({ kind: "demo", label: "Demo fallback data" });
  const [filters, setFilters] = useState<Filters>(initialFilters);

  useEffect(() => {
    let isActive = true;

    loadLocalEvents()
      .then((loaded) => {
        if (!isActive || !loaded) return;
        setEvents(loaded.events);
        setDataSource(loaded.source);
      })
      .catch(() => {
        if (!isActive) return;
        setDataSource({ kind: "demo", label: "Demo fallback data" });
      });

    return () => {
      isActive = false;
    };
  }, []);

  const filtered = useMemo(() => filterEvents(events, filters), [events, filters]);
  const summary = useMemo(() => summarize(filtered), [filtered]);
  const latestEvents = useMemo(
    () => [...filtered].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 12),
    [filtered],
  );

  const series = useMemo(() => timeseries(filtered), [filtered]);
  const providerGroups = useMemo(() => groupMetric(filtered, "provider", "cost"), [filtered]);
  const modelGroups = useMemo(() => groupMetric(filtered, "model", "tokens").slice(0, 8), [filtered]);
  const deviceGroups = useMemo(() => groupMetric(filtered, "deviceName", "cost"), [filtered]);
  const heatmapValues = useMemo(() => heatmap(filtered), [filtered]);

  const timelineOption: EChartsOption = {
    color: [accent, "#2563eb"],
    tooltip: { trigger: "axis" },
    legend: { top: 0, textStyle: { color: chartText } },
    grid: { left: 42, right: 18, top: 42, bottom: 32 },
    xAxis: { type: "category", data: series.map(([day]) => day.slice(5)), axisLine: { lineStyle: { color: chartGrid } }, axisLabel: { color: chartText } },
    yAxis: [
      { type: "value", axisLabel: { color: chartText }, splitLine: { lineStyle: { color: chartGrid } } },
      { type: "value", axisLabel: { color: chartText }, splitLine: { show: false } },
    ],
    series: [
      { name: "Cost", type: "line", smooth: true, areaStyle: { opacity: 0.12 }, data: series.map(([, value]) => Number(value.cost.toFixed(2))) },
      { name: "Tokens", type: "bar", yAxisIndex: 1, barWidth: 12, data: series.map(([, value]) => value.tokens) },
    ],
  };

  const providerOption: EChartsOption = {
    color: ["#0f766e", "#2563eb", "#b45309", "#7c3aed"],
    tooltip: { trigger: "item" },
    series: [
      {
        type: "pie",
        radius: ["54%", "78%"],
        center: ["50%", "52%"],
        label: { color: chartText, formatter: "{b}" },
        data: providerGroups.map(([name, value]) => ({ name, value: Number(value.toFixed(2)) })),
      },
    ],
  };

  const modelOption: EChartsOption = {
    color: [accent],
    tooltip: { trigger: "axis" },
    grid: { left: 118, right: 20, top: 16, bottom: 24 },
    xAxis: { type: "value", axisLabel: { color: chartText }, splitLine: { lineStyle: { color: chartGrid } } },
    yAxis: { type: "category", data: modelGroups.map(([name]) => name).reverse(), axisLabel: { color: chartText }, axisLine: { lineStyle: { color: chartGrid } } },
    series: [{ type: "bar", barWidth: 14, data: modelGroups.map(([, value]) => value).reverse() }],
  };

  const deviceOption: EChartsOption = {
    color: ["#2563eb"],
    tooltip: { trigger: "axis" },
    grid: { left: 42, right: 18, top: 18, bottom: 52 },
    xAxis: { type: "category", data: deviceGroups.map(([name]) => name), axisLabel: { color: chartText, interval: 0, rotate: 18 }, axisLine: { lineStyle: { color: chartGrid } } },
    yAxis: { type: "value", axisLabel: { color: chartText }, splitLine: { lineStyle: { color: chartGrid } } },
    series: [{ type: "bar", barWidth: 24, data: deviceGroups.map(([, value]) => Number(value.toFixed(2))) }],
  };

  const heatmapOption: EChartsOption = {
    tooltip: { position: "top" },
    grid: { left: 42, right: 20, top: 12, bottom: 34 },
    xAxis: { type: "category", data: Array.from({ length: 24 }, (_, hour) => `${hour}`), axisLabel: { color: chartText }, axisLine: { lineStyle: { color: chartGrid } } },
    yAxis: { type: "category", data: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], axisLabel: { color: chartText }, axisLine: { lineStyle: { color: chartGrid } } },
    visualMap: { min: 0, max: Math.max(1, ...heatmapValues.map((value) => value[2])), show: false, inRange: { color: ["#eef2f7", "#99f6e4", "#0f766e"] } },
    series: [{ type: "heatmap", data: heatmapValues, emphasis: { itemStyle: { borderColor: "#111827", borderWidth: 1 } } }],
  };

  function updateFilter<Key extends keyof Filters>(key: Key, value: Filters[Key]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function handleReset() {
    if (dataSource.kind === "local") {
      window.location.reload();
      return;
    }

    setEvents(resetEvents());
    setFilters(initialFilters);
  }

  return (
    <main className="min-h-screen bg-[#fbfbfa] text-ink">
      <div className="mx-auto flex w-full max-w-[1480px] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-accent">
              <Database size={16} />
              <span>{dataSource.label}</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-normal sm:text-4xl">Open Token</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Token, estimated cost, runtime, and device analytics for local AI development workflows.
              {dataSource.generatedAt ? ` Collected ${new Date(dataSource.generatedAt).toLocaleString()}.` : ""}
            </p>
            {dataSource.scannedPaths?.length ? (
              <p className="mt-1 max-w-3xl text-xs text-muted">Sources: {dataSource.scannedPaths.join(", ")}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex h-10 w-fit items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium transition hover:border-accent hover:text-accent"
          >
            <RotateCcw size={16} />
            {dataSource.kind === "local" ? "Reload local data" : "Reset demo data"}
          </button>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Total cost" value={formatCurrency(summary.cost)} detail={`${formatNumber(filtered.length)} events`} />
          <Metric label="Total tokens" value={formatNumber(summary.tokens)} detail={`${formatNumber(summary.requests)} requests`} />
          <Metric label="Average latency" value={`${formatNumber(summary.latency)} ms`} detail="Mean per event" />
          <Metric label="Success rate" value={`${filtered.length ? Math.round((filtered.filter((event) => event.status === "success").length / filtered.length) * 100) : 0}%`} detail="Filtered events" />
        </section>

        <section className="flex flex-col gap-3 border-y border-line py-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal size={16} />
            Filters
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Select label="Range" value={filters.range} onChange={(value) => updateFilter("range", value as Filters["range"])} options={["7d", "14d", "30d", "all"]} />
            <Select label="Project" value={filters.project} onChange={(value) => updateFilter("project", value)} options={getOptions(events, "project")} />
            <Select label="Provider" value={filters.provider} onChange={(value) => updateFilter("provider", value)} options={getOptions(events, "provider")} />
            <Select label="Model" value={filters.model} onChange={(value) => updateFilter("model", value)} options={getOptions(events, "model")} />
            <Select label="Device" value={filters.deviceName} onChange={(value) => updateFilter("deviceName", value)} options={getOptions(events, "deviceName")} />
            <Select label="Tool" value={filters.tool} onChange={(value) => updateFilter("tool", value)} options={getOptions(events, "tool")} />
          </div>
        </section>

        {filtered.length === 0 ? (
          <section className="flex min-h-[360px] items-center justify-center border border-dashed border-line bg-white">
            <div className="text-center">
              <Search className="mx-auto mb-3 text-muted" size={26} />
              <h2 className="text-lg font-semibold">No matching events</h2>
              <p className="mt-1 text-sm text-muted">Adjust filters or reload the local data.</p>
            </div>
          </section>
        ) : (
          <>
            <section className="grid gap-6 xl:grid-cols-[1.45fr_0.8fr]">
              <Panel title="Cost and Tokens Over Time">
                <Chart option={timelineOption} className="h-[320px] w-full" />
              </Panel>
              <Panel title="Provider Cost Share">
                <Chart option={providerOption} className="h-[320px] w-full" />
              </Panel>
            </section>

            <section className="grid gap-6 xl:grid-cols-3">
              <Panel title="Model Token Load">
                <Chart option={modelOption} className="h-[300px] w-full" />
              </Panel>
              <Panel title="Device Cost Comparison">
                <Chart option={deviceOption} className="h-[300px] w-full" />
              </Panel>
              <Panel title="Hourly Cost Heatmap">
                <Chart option={heatmapOption} className="h-[300px] w-full" />
              </Panel>
            </section>

            <section className="border-t border-line pt-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">Latest Events</h2>
                <span className="text-sm text-muted">{formatNumber(filtered.length)} filtered</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs uppercase text-muted">
                      <th className="py-3 pr-4 font-semibold">Time</th>
                      <th className="py-3 pr-4 font-semibold">Project</th>
                      <th className="py-3 pr-4 font-semibold">Tool</th>
                      <th className="py-3 pr-4 font-semibold">Provider</th>
                      <th className="py-3 pr-4 font-semibold">Model</th>
                      <th className="py-3 pr-4 font-semibold">Device</th>
                      <th className="py-3 pr-4 text-right font-semibold">Tokens</th>
                      <th className="py-3 pr-4 text-right font-semibold">Cost</th>
                      <th className="py-3 text-right font-semibold">Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestEvents.map((event) => (
                      <tr key={event.id} className="border-b border-line/70">
                        <td className="py-3 pr-4 text-muted">{new Date(event.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="py-3 pr-4 font-medium">{event.project}</td>
                        <td className="py-3 pr-4">{event.tool}</td>
                        <td className="py-3 pr-4">{event.provider}</td>
                        <td className="py-3 pr-4">{event.model}</td>
                        <td className="py-3 pr-4">{event.deviceName}</td>
                        <td className="py-3 pr-4 text-right">{formatNumber(totalTokens(event))}</td>
                        <td className="py-3 pr-4 text-right">{formatCurrency(event.costUsd)}</td>
                        <td className="py-3 text-right">{formatNumber(event.latencyMs)} ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border-l border-line bg-white px-4 py-4 shadow-[0_1px_0_rgba(17,24,39,0.04)]">
      <p className="text-xs font-semibold uppercase text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-normal">{value}</p>
      <p className="mt-1 text-sm text-muted">{detail}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 border-t border-line bg-white pt-4">
      <h2 className="px-4 text-base font-semibold">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-semibold uppercase text-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 min-w-0 rounded-md border border-line bg-white px-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export default App;
