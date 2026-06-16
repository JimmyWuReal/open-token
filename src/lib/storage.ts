import { demoEvents } from "../data/demoEvents";
import type { TokenEvent } from "../types";

const storageKey = "open-token-demo-events";

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
