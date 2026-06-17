#!/usr/bin/env node
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(root, "dist");
const home = os.homedir();
const dataDir = process.env.OPEN_TOKEN_HOME || path.join(home, ".open-token");
const outFile = path.join(dataDir, "token-events.json");
const deviceName = os.hostname() || os.platform();
const maxFilesPerRoot = 800;
const collectDeadlineMs = 6500;

const args = new Set(process.argv.slice(2));
const argList = process.argv.slice(2);
const port = numberArg("--port", 5173);
const shouldOpen = !args.has("--no-open") && !args.has("--collect-only");
const collectOnly = args.has("--collect-only");
const noCollect = args.has("--no-collect");
const importFile = stringArg("--import") || process.env.OPEN_TOKEN_EVENTS || "";

function stringArg(name) {
  const value = argList.find((entry) => entry.startsWith(`${name}=`));
  if (value) return value.slice(name.length + 1);
  const index = argList.indexOf(name);
  return index >= 0 ? argList[index + 1] : "";
}

function numberArg(name, fallback) {
  const parsed = Number(stringArg(name));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNumber(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function projectFromCwd(cwd) {
  if (!cwd || typeof cwd !== "string") return "Unknown";
  return path.basename(cwd) || cwd.replace(home, "~") || "Unknown";
}

function costUsd(event) {
  const key = `${event.provider} ${event.model}`.toLowerCase();
  const price = key.includes("claude")
    ? { input: 3, cached: 0.3, output: 15, reasoning: 15 }
    : key.includes("gpt") || key.includes("codex") || key.includes("openai")
      ? { input: 1.25, cached: 0.125, output: 10, reasoning: 10 }
      : { input: 1, cached: 0.1, output: 5, reasoning: 5 };
  return Number((((event.inputTokens * price.input) + (event.cachedTokens * price.cached) + (event.outputTokens * price.output) + (event.reasoningTokens * price.reasoning)) / 1_000_000).toFixed(6));
}

function normalize(raw) {
  const model = firstString(raw.model, raw.engine, raw.deployment, raw.provider);
  const event = {
    id: firstString(raw.id, `${raw.tool || "event"}_${raw.timestamp || Date.now()}_${Math.random().toString(16).slice(2)}`),
    timestamp: firstString(raw.timestamp, raw.createdAt, new Date().toISOString()),
    provider: firstString(raw.provider, "Unknown"),
    model: model || "Unknown",
    tool: firstString(raw.tool, "Imported"),
    project: firstString(raw.project, projectFromCwd(raw.cwd)),
    deviceName,
    inputTokens: parseNumber(raw.inputTokens ?? raw.prompt_tokens ?? raw.promptTokens),
    outputTokens: parseNumber(raw.outputTokens ?? raw.completion_tokens ?? raw.completionTokens),
    cachedTokens: parseNumber(raw.cachedTokens ?? raw.cached_input_tokens),
    reasoningTokens: parseNumber(raw.reasoningTokens ?? raw.reasoning_output_tokens),
    latencyMs: parseNumber(raw.latencyMs ?? raw.durationMs),
    requestCount: parseNumber(raw.requestCount) || 1,
    status: raw.status === "error" ? "error" : "success"
  };
  return { ...event, costUsd: Number(raw.costUsd ?? raw.cost_usd ?? costUsd(event)) || 0 };
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkJsonl(rootDir, startedAt) {
  if (!(await exists(rootDir)) || Date.now() - startedAt > collectDeadlineMs) return [];
  const found = [];
  async function visit(current) {
    if (found.length >= maxFilesPerRoot || Date.now() - startedAt > collectDeadlineMs) return;
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(entryPath);
      if (entry.isFile() && entry.name.endsWith(".jsonl")) found.push(entryPath);
      if (found.length >= maxFilesPerRoot) break;
    }
  }
  await visit(rootDir);
  const stats = await Promise.all(found.map(async (file) => {
    try {
      return { file, mtime: (await fs.stat(file)).mtimeMs };
    } catch {
      return null;
    }
  }));
  return stats.filter(Boolean).sort((a, b) => b.mtime - a.mtime).slice(0, maxFilesPerRoot).map((entry) => entry.file);
}

function safeJson(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function elapsed(lastUserTimestamp, timestamp) {
  if (!lastUserTimestamp || !timestamp) return 0;
  const ms = new Date(timestamp).getTime() - new Date(lastUserTimestamp).getTime();
  return ms > 0 && ms < 30 * 60 * 1000 ? ms : 0;
}

async function parseCodex(file) {
  const text = await fs.readFile(file, "utf8");
  let cwd = "";
  let sessionId = path.basename(file, ".jsonl");
  let lastUser = "";
  let model = "Codex";
  const events = [];
  for (const line of text.split("\n")) {
    const record = safeJson(line);
    if (!record) continue;
    if (record.type === "session_meta") {
      cwd = record.payload?.cwd || cwd;
      sessionId = record.payload?.id || sessionId;
      model = firstString(record.payload?.model, model);
    }
    if (record.type === "turn_context") {
      cwd = record.payload?.cwd || cwd;
      model = firstString(record.payload?.model, record.payload?.collaboration_mode?.settings?.model, model);
    }
    if (record.type === "response_item" && record.payload?.role === "user") lastUser = record.timestamp;
    if (record.type !== "event_msg" || record.payload?.type !== "token_count") continue;
    const usage = record.payload?.info?.last_token_usage;
    if (!usage) continue;
    const cachedTokens = parseNumber(usage.cached_input_tokens);
    events.push(normalize({
      id: `codex_${sessionId}_${events.length + 1}`,
      timestamp: record.timestamp,
      cwd,
      tool: "Codex",
      provider: "OpenAI",
      model,
      inputTokens: Math.max(0, parseNumber(usage.input_tokens) - cachedTokens),
      outputTokens: usage.output_tokens,
      cachedTokens,
      reasoningTokens: usage.reasoning_output_tokens,
      latencyMs: elapsed(lastUser, record.timestamp)
    }));
  }
  return events;
}

async function parseClaude(file) {
  const text = await fs.readFile(file, "utf8");
  let lastUser = "";
  const events = [];
  for (const line of text.split("\n")) {
    const record = safeJson(line);
    if (!record) continue;
    if (record.type === "user") lastUser = record.timestamp;
    const usage = record.message?.usage || record.usage;
    if (!usage || record.type !== "assistant") continue;
    events.push(normalize({
      id: `claude_${record.sessionId || path.basename(file, ".jsonl")}_${record.uuid || events.length + 1}`,
      timestamp: record.timestamp,
      cwd: record.cwd,
      tool: "Claude Code",
      provider: "Anthropic",
      model: record.message?.model || "Claude",
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cachedTokens: parseNumber(usage.cache_read_input_tokens) + parseNumber(usage.cache_creation_input_tokens),
      latencyMs: elapsed(lastUser, record.timestamp)
    }));
  }
  return events;
}

async function importEvents(file) {
  if (!file) return [];
  const text = await fs.readFile(path.resolve(file), "utf8");
  const rows = text.trim().startsWith("[") ? JSON.parse(text) : text.split("\n").map(safeJson).filter(Boolean);
  return rows.map(normalize);
}

async function collect() {
  const startedAt = Date.now();
  const sources = [
    { tool: "Codex", roots: [path.join(home, ".codex", "sessions"), path.join(home, ".codex", "archived_sessions")], parse: parseCodex },
    { tool: "Claude Code", roots: [path.join(home, ".claude", "projects")], parse: parseClaude }
  ];
  const events = [];
  const scannedPaths = [];
  for (const source of sources) {
    for (const sourceRoot of source.roots) {
      const files = await walkJsonl(sourceRoot, startedAt);
      if (files.length) scannedPaths.push(sourceRoot.replace(home, "~"));
      for (const file of files) {
        if (Date.now() - startedAt > collectDeadlineMs) break;
        try {
          events.push(...await source.parse(file));
        } catch {
          // Ignore malformed or permission-blocked local session files.
        }
      }
    }
  }
  if (importFile) events.push(...await importEvents(importFile));
  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const payload = {
    generatedAt: new Date().toISOString(),
    scannedPaths,
    totalEvents: events.length,
    events: events.slice(0, 5000)
  };
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(payload, null, 2));
  return payload;
}

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"]
]);

function safeJoin(base, requestPath) {
  const resolved = path.resolve(base, requestPath.replace(/^\/+/, ""));
  return resolved.startsWith(base) ? resolved : base;
}

async function serveFile(response, filePath) {
  try {
    const data = await fs.readFile(filePath);
    response.writeHead(200, { "content-type": mimeTypes.get(path.extname(filePath)) || "application/octet-stream" });
    response.end(data);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

async function startStaticServer() {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    if (url.pathname === "/local-data/token-events.json") {
      await serveFile(response, outFile);
      return;
    }
    const distExists = await exists(path.join(distRoot, "index.html"));
    if (!distExists) {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<h1>Open Token</h1><p>Run <code>npm run build</code>, then start Open Token again.</p>");
      return;
    }
    const candidate = url.pathname === "/" ? path.join(distRoot, "index.html") : safeJoin(distRoot, url.pathname);
    await serveFile(response, candidate);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}

async function openBrowser(url) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const params = process.platform === "win32" ? ["/c", "start", url] : [url];
  execFile(command, params, { stdio: "ignore" }).unref();
}

if (collectOnly) {
  const payload = await collect();
  console.log(`Collected ${payload.events.length} dashboard events in ${payload.scannedPaths.length || 0} source groups.`);
  process.exit(0);
}

await startStaticServer();
const url = `http://127.0.0.1:${port}/`;
console.log(`Open Token is running at ${url}`);
if (shouldOpen) await openBrowser(url);

if (!noCollect) {
  collect()
    .then((payload) => console.log(`Collected ${payload.events.length} dashboard events in ${payload.scannedPaths.length || 0} source groups.`))
    .catch((error) => console.error(`Collection failed: ${error.message}`));
}
