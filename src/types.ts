export type TokenEventStatus = "success" | "error";

export type TokenEvent = {
  id: string;
  timestamp: string;
  deviceName: string;
  project: string;
  tool: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  costUsd: number;
  latencyMs: number;
  requestCount: number;
  status: TokenEventStatus;
};

export type Filters = {
  range: "7d" | "14d" | "30d" | "all";
  project: string;
  provider: string;
  model: string;
  deviceName: string;
  tool: string;
};
