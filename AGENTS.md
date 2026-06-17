# Open Token

Open Token is a local-first, open source token analytics dashboard for AI development workflows.
It visualizes token usage, estimated cost, latency, providers, models, devices, and recent events.
The app is a Vite + React + TypeScript frontend with ECharts charts and Tailwind styling.
It reads generated local dashboard data from `public/local-data/token-events.json`.
When local data is unavailable, it falls back to seeded demo data.
The collector scans local Codex and Claude Code session logs and writes dashboard metadata only.
Do not commit private prompts, assistant messages, file contents, tool output, secrets, or raw logs.
