import type { Filters, TokenEvent } from "../types";

export const allValue = "All";

export function totalTokens(event: TokenEvent) {
  return event.inputTokens + event.outputTokens + event.cachedTokens + event.reasoningTokens;
}

export function getOptions(events: TokenEvent[], key: keyof Pick<TokenEvent, "project" | "provider" | "model" | "deviceName" | "tool">) {
  return [allValue, ...Array.from(new Set(events.map((event) => String(event[key])))).sort()];
}

export function filterEvents(events: TokenEvent[], filters: Filters) {
  const latest = Math.max(...events.map((event) => new Date(event.timestamp).getTime()));
  const days = filters.range === "7d" ? 7 : filters.range === "14d" ? 14 : filters.range === "30d" ? 30 : null;
  const rangeStart = days ? latest - days * 24 * 60 * 60 * 1000 : null;

  return events.filter((event) => {
    const time = new Date(event.timestamp).getTime();
    return (
      (!rangeStart || time >= rangeStart) &&
      (filters.project === allValue || event.project === filters.project) &&
      (filters.provider === allValue || event.provider === filters.provider) &&
      (filters.model === allValue || event.model === filters.model) &&
      (filters.deviceName === allValue || event.deviceName === filters.deviceName) &&
      (filters.tool === allValue || event.tool === filters.tool)
    );
  });
}

export function summarize(events: TokenEvent[]) {
  const cost = events.reduce((sum, event) => sum + event.costUsd, 0);
  const tokens = events.reduce((sum, event) => sum + totalTokens(event), 0);
  const requests = events.reduce((sum, event) => sum + event.requestCount, 0);
  const latency = events.length ? events.reduce((sum, event) => sum + event.latencyMs, 0) / events.length : 0;

  return { cost, tokens, requests, latency };
}

export function groupMetric(events: TokenEvent[], key: keyof TokenEvent, metric: "cost" | "tokens" | "requests" = "cost") {
  const grouped = new Map<string, number>();
  events.forEach((event) => {
    const value = metric === "cost" ? event.costUsd : metric === "tokens" ? totalTokens(event) : event.requestCount;
    grouped.set(String(event[key]), (grouped.get(String(event[key])) ?? 0) + value);
  });
  return Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]);
}

export function timeseries(events: TokenEvent[]) {
  const grouped = new Map<string, { cost: number; tokens: number }>();
  events.forEach((event) => {
    const day = event.timestamp.slice(0, 10);
    const current = grouped.get(day) ?? { cost: 0, tokens: 0 };
    current.cost += event.costUsd;
    current.tokens += totalTokens(event);
    grouped.set(day, current);
  });
  return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export function heatmap(events: TokenEvent[]) {
  const grid = new Map<string, number>();
  events.forEach((event) => {
    const date = new Date(event.timestamp);
    const key = `${date.getUTCDay()}-${date.getUTCHours()}`;
    grid.set(key, (grid.get(key) ?? 0) + event.costUsd);
  });

  const values: [number, number, number][] = [];
  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      values.push([hour, day, Number((grid.get(`${day}-${hour}`) ?? 0).toFixed(3))]);
    }
  }
  return values;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}
