import type { Filters, TokenEvent } from "./types";

export const all = "All";

export function tokens(event: TokenEvent) {
  return event.inputTokens + event.outputTokens + event.cachedTokens + event.reasoningTokens;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

/** Abbreviate a token count to a single decimal, e.g. 33.2m, 12b. */
export function formatTokens(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${trimDecimal(value / 1_000_000_000)}b`;
  if (abs >= 1_000_000) return `${trimDecimal(value / 1_000_000)}m`;
  if (abs >= 1_000) return `${trimDecimal(value / 1_000)}k`;
  return formatNumber(value);
}

function trimDecimal(value: number) {
  return value.toFixed(1).replace(/\.0$/, "");
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

export type DayTotal = { date: string; tokens: number; cost: number };

/** Sum tokens and cost per calendar day (UTC), keyed `YYYY-MM-DD`. */
export function dailyTotals(events: TokenEvent[]) {
  const days = new Map<string, { tokens: number; cost: number }>();
  for (const event of events) {
    const day = event.timestamp.slice(0, 10);
    const current = days.get(day) || { tokens: 0, cost: 0 };
    current.tokens += tokens(event);
    current.cost += event.costUsd;
    days.set(day, current);
  }
  return days;
}

function dayKey(utcMs: number) {
  return new Date(utcMs).toISOString().slice(0, 10);
}

/** Build the last `count` calendar days ending today, filling gaps with zeros. */
export function lastDays(totals: Map<string, { tokens: number; cost: number }>, count: number): DayTotal[] {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out: DayTotal[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = dayKey(todayUtc - i * 86_400_000);
    const value = totals.get(date) || { tokens: 0, cost: 0 };
    out.push({ date, tokens: value.tokens, cost: value.cost });
  }
  return out;
}

export type DayProviderTotal = {
  date: string;
  tokens: number;
  cost: number;
  byProvider: Record<string, number>;
  costByProvider: Record<string, number>;
};

type ProviderDay = { tokens: number; cost: number; byProvider: Map<string, number>; costByProvider: Map<string, number> };

/** Sum tokens and cost (each split by provider) per calendar day (UTC), keyed `YYYY-MM-DD`. */
export function dailyProviderTotals(events: TokenEvent[]) {
  const days = new Map<string, ProviderDay>();
  for (const event of events) {
    const day = event.timestamp.slice(0, 10);
    const current = days.get(day) || { tokens: 0, cost: 0, byProvider: new Map<string, number>(), costByProvider: new Map<string, number>() };
    const eventTokens = tokens(event);
    current.tokens += eventTokens;
    current.cost += event.costUsd;
    current.byProvider.set(event.provider, (current.byProvider.get(event.provider) || 0) + eventTokens);
    current.costByProvider.set(event.provider, (current.costByProvider.get(event.provider) || 0) + event.costUsd);
    days.set(day, current);
  }
  return days;
}

/** Build the last `count` days with per-provider token and cost splits, filling gaps with zeros. */
export function lastDaysByProvider(totals: Map<string, ProviderDay>, count: number): DayProviderTotal[] {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out: DayProviderTotal[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = dayKey(todayUtc - i * 86_400_000);
    const value = totals.get(date);
    out.push({
      date,
      tokens: value?.tokens ?? 0,
      cost: value?.cost ?? 0,
      byProvider: value ? Object.fromEntries(value.byProvider) : {},
      costByProvider: value ? Object.fromEntries(value.costByProvider) : {}
    });
  }
  return out;
}

/** Providers present across the given days, ordered by total of `metric` descending. */
export function providerOrder(days: DayProviderTotal[], metric: "tokens" | "cost" = "tokens"): string[] {
  const totals = new Map<string, number>();
  for (const day of days) {
    const source = metric === "cost" ? day.costByProvider : day.byProvider;
    for (const [provider, value] of Object.entries(source)) {
      totals.set(provider, (totals.get(provider) || 0) + value);
    }
  }
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([provider]) => provider);
}

export function lifetime(events: TokenEvent[]) {
  return events.reduce(
    (acc, event) => {
      acc.tokens += tokens(event);
      acc.cost += event.costUsd;
      return acc;
    },
    { tokens: 0, cost: 0 }
  );
}

/** Longest run of consecutive calendar days that recorded any tokens. */
export function longestStreak(totals: Map<string, { tokens: number; cost: number }>) {
  const active = Array.from(totals.entries())
    .filter(([, value]) => value.tokens > 0)
    .map(([day]) => day)
    .sort();
  let best = 0;
  let current = 0;
  let previous = 0;
  for (const day of active) {
    const ms = Date.parse(day);
    current = previous && ms - previous === 86_400_000 ? current + 1 : 1;
    previous = ms;
    best = Math.max(best, current);
  }
  return best;
}
