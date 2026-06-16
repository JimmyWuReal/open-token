import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const outputPath = path.resolve("public/local-data/token-events.json");
const maxFilesPerSource = 1500;

const home = os.homedir();
const deviceName = os.hostname() || os.platform();

const sources = [
  {
    tool: "Codex",
    provider: "OpenAI",
    roots: [
      path.join(home, ".codex", "sessions"),
      path.join(home, ".codex", "archived_sessions"),
    ],
    parser: parseCodexFile,
  },
  {
    tool: "Claude Code",
    provider: "Anthropic",
    roots: [path.join(home, ".claude", "projects")],
    parser: parseClaudeFile,
  },
];

const pricesPerMillion = [
  { match: /claude/i, input: 3, cached: 0.3, output: 15, reasoning: 15 },
  { match: /gpt|codex|openai/i, input: 1.25, cached: 0.125, output: 10, reasoning: 10 },
  { match: /.*/, input: 1, cached: 0.1, output: 5, reasoning: 5 },
];

function parseNumber(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
}

function projectFromCwd(cwd) {
  if (!cwd || typeof cwd !== "string") return "Unknown project";
  const name = path.basename(cwd);
  return name || cwd.replace(home, "~") || "Unknown project";
}

function estimateCostUsd({ provider, model, inputTokens, outputTokens, cachedTokens, reasoningTokens }) {
  const key = `${provider} ${model}`;
  const price = pricesPerMillion.find((entry) => entry.match.test(key)) ?? pricesPerMillion.at(-1);
  const cost =
    (inputTokens * price.input +
      outputTokens * price.output +
      cachedTokens * price.cached +
      reasoningTokens * price.reasoning) /
    1_000_000;
  return Number(cost.toFixed(6));
}

function normalizeEvent(event) {
  const model = event.model || event.tool;
  const normalized = {
    id: event.id,
    timestamp: event.timestamp,
    deviceName,
    project: projectFromCwd(event.cwd),
    tool: event.tool,
    provider: event.provider,
    model,
    inputTokens: parseNumber(event.inputTokens),
    outputTokens: parseNumber(event.outputTokens),
    cachedTokens: parseNumber(event.cachedTokens),
    reasoningTokens: parseNumber(event.reasoningTokens),
    latencyMs: parseNumber(event.latencyMs),
    requestCount: 1,
    status: event.status === "error" ? "error" : "success",
  };

  return {
    ...normalized,
    costUsd: estimateCostUsd(normalized),
  };
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkJsonl(root) {
  if (!(await pathExists(root))) return [];

  const files = [];
  async function visit(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(entryPath);
      }
    }
  }

  await visit(root);
  const stats = await Promise.all(
    files.map(async (file) => ({
      file,
      mtimeMs: (await fs.stat(file)).mtimeMs,
    })),
  );
  return stats
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, maxFilesPerSource)
    .map(({ file }) => file);
}

function safeParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function elapsedSince(lastUserTimestamp, timestamp) {
  if (!lastUserTimestamp || !timestamp) return 0;
  const elapsed = new Date(timestamp).getTime() - new Date(lastUserTimestamp).getTime();
  return elapsed > 0 && elapsed < 30 * 60 * 1000 ? elapsed : 0;
}

async function parseCodexFile(file) {
  const text = await fs.readFile(file, "utf8");
  let sessionCwd = "";
  let sessionId = path.basename(file, ".jsonl");
  let lastUserTimestamp = "";
  const events = [];

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const record = safeParse(line);
    if (!record) continue;

    if (record.type === "session_meta") {
      sessionCwd = record.payload?.cwd ?? sessionCwd;
      sessionId = record.payload?.id ?? sessionId;
    }

    if (record.type === "response_item" && record.payload?.role === "user") {
      lastUserTimestamp = record.timestamp;
    }

    if (record.type !== "event_msg" || record.payload?.type !== "token_count") continue;

    const usage = record.payload?.info?.last_token_usage;
    if (!usage) continue;

    const cachedTokens = parseNumber(usage.cached_input_tokens);
    const totalInputTokens = parseNumber(usage.input_tokens);
    const outputTokens = parseNumber(usage.output_tokens);
    const reasoningTokens = parseNumber(usage.reasoning_output_tokens);

    events.push(
      normalizeEvent({
        id: `codex_${sessionId}_${events.length + 1}`,
        timestamp: record.timestamp,
        cwd: sessionCwd,
        tool: "Codex",
        provider: "OpenAI",
        model: "Codex",
        inputTokens: Math.max(0, totalInputTokens - cachedTokens),
        outputTokens,
        cachedTokens,
        reasoningTokens,
        latencyMs: elapsedSince(lastUserTimestamp, record.timestamp),
      }),
    );
  }

  return events;
}

async function parseClaudeFile(file) {
  const text = await fs.readFile(file, "utf8");
  let lastUserTimestamp = "";
  const events = [];

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const record = safeParse(line);
    if (!record) continue;

    if (record.type === "user" && record.timestamp) {
      lastUserTimestamp = record.timestamp;
    }

    const usage = record.message?.usage ?? record.usage;
    if (!usage || record.type !== "assistant") continue;

    const cachedTokens = parseNumber(usage.cache_read_input_tokens) + parseNumber(usage.cache_creation_input_tokens);
    const inputTokens = parseNumber(usage.input_tokens);
    const outputTokens = parseNumber(usage.output_tokens);

    events.push(
      normalizeEvent({
        id: `claude_${record.sessionId ?? path.basename(file, ".jsonl")}_${record.uuid ?? events.length + 1}`,
        timestamp: record.timestamp,
        cwd: record.cwd,
        tool: "Claude Code",
        provider: "Anthropic",
        model: record.message?.model ?? "Claude",
        inputTokens,
        outputTokens,
        cachedTokens,
        reasoningTokens: 0,
        latencyMs: elapsedSince(lastUserTimestamp, record.timestamp),
      }),
    );
  }

  return events;
}

async function collect() {
  const scannedPaths = [];
  const eventGroups = [];

  for (const source of sources) {
    const files = [];
    for (const root of source.roots) {
      const rootFiles = await walkJsonl(root);
      if (rootFiles.length) {
        scannedPaths.push(root.replace(home, "~"));
        files.push(...rootFiles);
      }
    }

    for (const file of files) {
      eventGroups.push(await source.parser(file));
    }
  }

  const events = eventGroups
    .flat()
    .filter((event) => event.timestamp && event.inputTokens + event.outputTokens + event.cachedTokens + event.reasoningTokens > 0)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const payload = {
    generatedAt: new Date().toISOString(),
    deviceName,
    scannedPaths: Array.from(new Set(scannedPaths)).sort(),
    events,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

  console.log(`Collected ${events.length} local token events.`);
  console.log(`Wrote ${outputPath}`);
}

collect().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
