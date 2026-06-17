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

export type LocalLoadStage = "requesting" | "downloading" | "parsing" | "validating" | "ready" | "fallback" | "error";

export type LocalLoadProgress = {
  stage: LocalLoadStage;
  loadedBytes?: number;
  totalBytes?: number;
  eventCount?: number;
  message: string;
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

async function readResponseText(response: Response, onProgress?: (progress: LocalLoadProgress) => void) {
  const totalBytes = Number(response.headers.get("content-length")) || undefined;

  if (!response.body) {
    onProgress?.({ stage: "downloading", totalBytes, message: "Downloading local data" });
    return response.text();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.byteLength;
    onProgress?.({
      stage: "downloading",
      loadedBytes,
      totalBytes,
      message: totalBytes ? `Downloading local data (${Math.round((loadedBytes / totalBytes) * 100)}%)` : "Downloading local data",
    });
  }

  const body = new Uint8Array(loadedBytes);
  let offset = 0;
  chunks.forEach((chunk) => {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  });

  return new TextDecoder().decode(body);
}

export async function loadLocalEvents(onProgress?: (progress: LocalLoadProgress) => void): Promise<{ events: TokenEvent[]; source: EventDataSource } | null> {
  onProgress?.({ stage: "requesting", message: "Requesting local data" });
  const response = await fetch(`${localDataPath}?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) {
    onProgress?.({ stage: "fallback", message: `Local data unavailable (${response.status})` });
    return null;
  }

  const text = await readResponseText(response, onProgress);
  onProgress?.({ stage: "parsing", loadedBytes: text.length, message: "Parsing local data" });
  const payload = JSON.parse(text) as LocalDataPayload | TokenEvent[];
  const events = Array.isArray(payload) ? payload : payload.events;
  if (!Array.isArray(events)) {
    onProgress?.({ stage: "fallback", message: "Local data did not contain events" });
    return null;
  }

  onProgress?.({ stage: "validating", eventCount: events.length, message: `Validating ${events.length.toLocaleString()} events` });
  const validEvents = events.filter(isTokenEvent);
  if (validEvents.length === 0) {
    onProgress?.({ stage: "fallback", message: "Local data contained no valid events" });
    return null;
  }

  onProgress?.({ stage: "ready", eventCount: validEvents.length, message: `Loaded ${validEvents.length.toLocaleString()} local events` });

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
