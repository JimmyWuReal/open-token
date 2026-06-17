import type { Filters, TokenEvent } from "./types";

export const all = "All";

export function tokens(event: TokenEvent) {
  return event.inputTokens + event.outputTokens + event.cachedTokens + event.reasoningTokens;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

export function filterEvents(events: TokenEvent[], filters: Filters) {
  const now = Date.now();
  const rangeMs = filters.range === "24h" ? 86_400_000 : filters.range === "7d" ? 7 * 86_400_000 : filters.range === "30d" ? 30 * 86_400_000 : Infinity;
  return events.filter((event) => {
    const age = now - new Date(event.timestamp).getTime();
    return age <= rangeMs &&
      (filters.provider === all || event.provider === filters.provider) &&
      (filters.model === all || event.model === filters.model) &&
      (filters.tool === all || event.tool === filters.tool);
  });
}

export function options(events: TokenEvent[], key: "provider" | "model" | "tool") {
  return [all, ...Array.from(new Set(events.map((event) => event[key]).filter(Boolean))).sort()];
}

export function summarize(events: TokenEvent[]) {
  const total = events.reduce((acc, event) => {
    acc.cost += event.costUsd;
    acc.tokens += tokens(event);
    acc.latency += event.latencyMs;
    acc.requests += event.requestCount;
    if (event.status === "success") acc.success += 1;
    return acc;
  }, { cost: 0, tokens: 0, latency: 0, requests: 0, success: 0 });
  return {
    ...total,
    latency: events.length ? total.latency / events.length : 0,
    successRate: events.length ? Math.round((total.success / events.length) * 100) : 0
  };
}

export function group(events: TokenEvent[], key: "provider" | "model" | "tool", metric: "cost" | "tokens") {
  const map = new Map<string, number>();
  for (const event of events) {
    map.set(event[key], (map.get(event[key]) || 0) + (metric === "cost" ? event.costUsd : tokens(event)));
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

export function timeline(events: TokenEvent[]) {
  const days = new Map<string, { tokens: number; cost: number }>();
  for (const event of events) {
    const day = event.timestamp.slice(0, 10);
    const current = days.get(day) || { tokens: 0, cost: 0 };
    current.tokens += tokens(event);
    current.cost += event.costUsd;
    days.set(day, current);
  }
  return Array.from(days.entries()).sort(([a], [b]) => a.localeCompare(b));
}
