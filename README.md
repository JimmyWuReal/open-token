# Open Token

Local-first token and cost analytics for AI-heavy development workflows.

The app is fully local. It can read generated data from your own computer and falls back to seeded demo data when no local data file exists. There is no Convex backend, auth, cloud sync, or database.

## Real user flow

1. Install dependencies:

```bash
npm install
```

2. Collect local usage data:

```bash
npm run collect
```

The collector scans local AI coding-tool session logs from:

- `~/.codex/sessions`
- `~/.codex/archived_sessions`
- `~/.claude/projects`

It writes dashboard-ready metadata to `public/local-data/token-events.json`. That generated file is ignored by git. It includes timestamps, local project names, tool names, providers, models, token counts, estimated cost, and observed response time where available. It does not copy prompts, assistant messages, file contents, or tool output into the dashboard data file.

3. Start the app:

```bash
npm run dev
```

4. Open the local Vite URL printed in the terminal.

5. Use the dashboard:

- Check the top-left data label. It should say `Local computer data`.
- Filter by range, project, provider, model, device, or tool.
- Review cost and token trends, provider share, model load, device comparison, hourly usage, and latest events.
- After more Codex or Claude Code usage, run `npm run collect` again and press `Reload local data` in the app.

If the label says `Demo fallback data`, run `npm run collect` first, then reload the browser.

## Build

```bash
npm run build
```
