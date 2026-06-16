import { demoEvents } from "../data/demoEvents";
import type { TokenEvent } from "../types";

const storageKey = "open-token-demo-events";
const localDataPath = "/local-data/token-events.json";

export type EventDataSource = {
  kind: "local" | "demo";
  label: string;
  generatedAt?: string;
  scannedPaths?: string[];
};

type LocalDataPayload = {
  generatedAt?: string;
  scannedPaths?: string[];
  events?: TokenEvent[];
};

function isTokenEvent(value: unknown): value is TokenEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<TokenEvent>;
  return (
    typeof event.id === "string" &&
    typeof event.timestamp === "string" &&
    typeof event.project === "string" &&
    typeof event.provider === "string" &&
    typeof event.model === "string" &&
    typeof event.tool === "string" &&
    typeof event.inputTokens === "number" &&
    typeof event.outputTokens === "number" &&
    typeof event.cachedTokens === "number" &&
    typeof event.reasoningTokens === "number" &&
    typeof event.costUsd === "number" &&
    typeof event.latencyMs === "number" &&
    typeof event.requestCount === "number"
  );
}

export function loadEvents() {
  const stored = localStorage.getItem(storageKey);
  if (!stored) return demoEvents;

  try {
    const parsed = JSON.parse(stored) as TokenEvent[];
    return Array.isArray(parsed) ? parsed : demoEvents;
  } catch {
    return demoEvents;
  }
}

export function saveEvents(events: TokenEvent[]) {
  localStorage.setItem(storageKey, JSON.stringify(events));
}

export function resetEvents() {
  localStorage.removeItem(storageKey);
  return demoEvents;
}

export async function loadLocalEvents(): Promise<{ events: TokenEvent[]; source: EventDataSource } | null> {
  const response = await fetch(`${localDataPath}?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) return null;

  const payload = (await response.json()) as LocalDataPayload | TokenEvent[];
  const events = Array.isArray(payload) ? payload : payload.events;
  if (!Array.isArray(events)) return null;

  const validEvents = events.filter(isTokenEvent);
  if (validEvents.length === 0) return null;

  return {
    events: validEvents,
    source: {
      kind: "local",
      label: "Local computer data",
      generatedAt: Array.isArray(payload) ? undefined : payload.generatedAt,
      scannedPaths: Array.isArray(payload) ? undefined : payload.scannedPaths,
    },
  };
}
