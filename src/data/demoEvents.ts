import type { TokenEvent } from "../types";

const devices = ["MacBook Pro", "Studio Desktop", "CI Runner", "Linux Server"];
const projects = ["open_token", "replx", "agent_lab", "docs_ingest"];
const tools = ["Codex", "Claude Code", "Cursor", "API Script"];
const providers = [
  { provider: "OpenAI", models: ["gpt-5", "gpt-4.1", "o3"] },
  { provider: "Anthropic", models: ["claude-sonnet-4", "claude-opus-4"] },
  { provider: "Google", models: ["gemini-2.5-pro", "gemini-2.5-flash"] },
  { provider: "OpenRouter", models: ["qwen3-coder", "deepseek-r1"] },
];

const now = new Date("2026-06-16T12:00:00.000Z").getTime();

export const demoEvents: TokenEvent[] = Array.from({ length: 180 }, (_, index) => {
  const providerConfig = providers[index % providers.length];
  const model = providerConfig.models[index % providerConfig.models.length];
  const inputTokens = 900 + ((index * 271) % 28000);
  const outputTokens = 260 + ((index * 173) % 7600);
  const cachedTokens = index % 3 === 0 ? 1200 + ((index * 89) % 6400) : 0;
  const reasoningTokens = index % 4 === 0 ? 420 + ((index * 113) % 5200) : 0;
  const costMultiplier = providerConfig.provider === "OpenAI" ? 0.000018 : providerConfig.provider === "Anthropic" ? 0.000021 : 0.000012;
  const costUsd = Number(((inputTokens + outputTokens * 3 + reasoningTokens * 2 - cachedTokens * 0.4) * costMultiplier).toFixed(4));
  const hoursAgo = index * 4 + (index % 7) * 2;

  return {
    id: `evt_${String(index + 1).padStart(4, "0")}`,
    timestamp: new Date(now - hoursAgo * 60 * 60 * 1000).toISOString(),
    deviceName: devices[index % devices.length],
    project: projects[(index + Math.floor(index / 5)) % projects.length],
    tool: tools[(index + Math.floor(index / 9)) % tools.length],
    provider: providerConfig.provider,
    model,
    inputTokens,
    outputTokens,
    cachedTokens,
    reasoningTokens,
    costUsd,
    latencyMs: 850 + ((index * 137) % 9400),
    requestCount: 1 + (index % 5),
    status: index % 23 === 0 ? "error" : "success",
  };
});
