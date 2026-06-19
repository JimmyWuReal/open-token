import type { CollectionStatus, DataPayload, TokenEvent } from "./types";

const providers = [
  ["OpenAI", "gpt-4.1", "Codex"],
  ["Anthropic", "claude-sonnet-4", "Claude Code"],
  ["Google", "gemini-2.5-pro", "Custom SDK"],
  ["Mistral", "codestral-latest", "Custom SDK"]
] as const;

// Deterministic pseudo-random in [0, 1) so the demo heatmap looks varied but stable.
function noise(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export function demoPayload(): DataPayload {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const events: TokenEvent[] = [];
  let index = 0;

  // One year of activity, with gaps and ramps so streaks and the heatmap read naturally.
  for (let dayOffset = 364; dayOffset >= 0; dayOffset--) {
    // Skip roughly a fifth of days to create breaks between streaks.
    if (noise(dayOffset + 7) < 0.2) continue;

    // Heavier usage on recent days and a gentle weekly rhythm.
    const recency = 0.4 + 0.6 * (1 - dayOffset / 364);
    const weekday = new Date(todayUtc - dayOffset * 86_400_000).getUTCDay();
    const weekendDip = weekday === 0 || weekday === 6 ? 0.45 : 1;
    const intensity = recency * weekendDip * (0.5 + noise(dayOffset * 3.3));
    const eventsToday = 1 + Math.floor(noise(dayOffset * 1.7) * 4 * recency);

    for (let e = 0; e < eventsToday; e++) {
      const [provider, model, tool] = providers[index % providers.length];
      const scale = 1 + intensity * 3;
      const inputTokens = Math.round((900 + ((index * 317) % 6200)) * scale);
      const outputTokens = Math.round((300 + ((index * 191) % 2800)) * scale);
      const cachedTokens = index % 3 === 0 ? Math.round((1200 + index * 8) * scale) : 0;
      const reasoningTokens = provider === "OpenAI" || provider === "Anthropic" ? Math.round((200 + ((index * 47) % 1600)) * scale) : 0;
      const timestamp = new Date(todayUtc - dayOffset * 86_400_000 + (9 + e) * 3_600_000).toISOString();
      events.push({
        id: `demo_${index}`,
        timestamp,
        provider,
        model,
        tool,
        project: ["open-token", "checkout-agent", "docs-index"][index % 3],
        deviceName: ["MacBook Pro", "Studio", "CI Runner"][index % 3],
        inputTokens,
        outputTokens,
        cachedTokens,
        reasoningTokens,
        latencyMs: 900 + ((index * 73) % 6200),
        requestCount: 1,
        status: index % 19 === 0 ? "error" : "success",
        costUsd: Number(((inputTokens * 1.2 + outputTokens * 8 + cachedTokens * 0.1 + reasoningTokens * 6) / 1_000_000).toFixed(6))
      });
      index += 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    scannedPaths: [],
    totalEvents: events.length,
    events
  };
}

export async function loadPayload(): Promise<{ payload: DataPayload; local: boolean }> {
  try {
    const response = await fetch(`/local-data/token-events.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("missing local data");
    const payload = await response.json() as DataPayload;
    if (!Array.isArray(payload.events) || payload.events.length === 0) throw new Error("empty local data");
    return { payload, local: true };
  } catch {
    return { payload: demoPayload(), local: false };
  }
}

export async function loadCollectionStatus(): Promise<CollectionStatus | null> {
  try {
    const response = await fetch(`/local-data/status.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const status = await response.json() as CollectionStatus;
    return status && typeof status.state === "string" ? status : null;
  } catch {
    return null;
  }
}

export async function requestCollectionRefresh(): Promise<boolean> {
  try {
    const response = await fetch(`/local-data/refresh?ts=${Date.now()}`, {
      method: "POST",
      cache: "no-store"
    });
    return response.ok;
  } catch {
    return false;
  }
}
