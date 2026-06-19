export type TokenEvent = {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  tool: string;
  project: string;
  deviceName: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  latencyMs: number;
  requestCount: number;
  status: "success" | "error";
  costUsd: number;
};

export type DataPayload = {
  generatedAt: string;
  scannedPaths: string[];
  totalEvents: number;
  events: TokenEvent[];
};

export type CollectionStatus = {
  state: "idle" | "running" | "done" | "error";
  progress: number;
  message: string;
  rootsTotal: number;
  rootsScanned: number;
  filesDiscovered: number;
  filesParsed: number;
  eventsCollected: number;
  scannedPaths: string[];
  generatedAt?: string;
  startedAt?: string;
  updatedAt?: string;
  finishedAt?: string;
  currentSource?: string;
  totalEvents?: number;
  error?: string;
};

export type Filters = {
  range: "24h" | "7d" | "30d" | "all";
  provider: string;
  model: string;
  tool: string;
};
