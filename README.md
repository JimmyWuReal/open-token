# Open Token

Open Token is a local-first token analytics dashboard for AI development workflows. It scans local Codex and Claude Code session metadata, can import generic provider JSON or JSONL, and opens a localhost dashboard.

It does not copy prompts, assistant messages, file contents, tool output, secrets, or raw logs. The generated dashboard data contains timestamps, providers, models, token counts, estimated cost, latency, tools, projects, and device names.

## Quick Start

```bash
npm install
npm start
```

The CLI starts a small local static server at `http://127.0.0.1:5173`, opens the browser, and collects sanitized local metrics in the background. The dashboard loads first, then shows collection progress while all discovered local metadata is gathered.

## Use As A Package

From this repository:

```bash
npm link
open-token
```

From npm after publishing:

```bash
npx open-token
```

Useful flags:

```bash
open-token --port 5180
open-token --no-open
open-token --no-collect
open-token --collect-only
open-token --import ./events.jsonl
```

Imported events may be JSON or JSONL. Supported fields include `provider`, `model`, `tool`, `project`, `timestamp`, `inputTokens`, `outputTokens`, `cachedTokens`, `reasoningTokens`, `latencyMs`, `costUsd`, and common OpenAI-style aliases such as `prompt_tokens` and `completion_tokens`.

## Local Sources

Open Token scans:

- `~/.codex/sessions`
- `~/.codex/archived_sessions`
- `~/.claude/projects`

Dashboard data is written to `~/.open-token/token-events.json`. Set `OPEN_TOKEN_HOME=/path/to/dir` to choose a different local data directory.

## Development

```bash
npm run dev
npm run build
```
