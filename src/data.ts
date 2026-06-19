import type { CollectionStatus, DataPayload, TokenEvent } from "./types";

const providers = [
  ["OpenAI", "gpt-4.1", "Codex"],
  ["Anthropic", "claude-sonnet-4", "Claude Code"],
  ["Google", "gemini-2.5-pro", "Custom SDK"],
  ["Mistral", "codestral-latest", "Custom SDK"]
] as const;

export function demoPayload(): DataPayload {
  const now = Date.now();
  const events: TokenEvent[] = Array.from({ length: 96 }, (_, index) => {
    const [provider, model, tool] = providers[index % providers.length];
    const inputTokens = 900 + ((index * 317) % 6200);
    const outputTokens = 300 + ((index * 191) % 2800);
    const cachedTokens = index % 3 === 0 ? 1200 + index * 8 : 0;
    const reasoningTokens = provider === "OpenAI" || provider === "Anthropic" ? 200 + ((index * 47) % 1600) : 0;
    return {
      id: `demo_${index}`,
      timestamp: new Date(now - index * 5 * 60 * 60 * 1000).toISOString(),
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
    };
  });
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
