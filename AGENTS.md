# Open Token Agent Notes

Open Token is a local-first, open source token analytics dashboard for AI development workflows. It helps users inspect token usage, estimated cost, latency, provider/model mix, device usage, and recent activity from local coding-tool session logs.

## Project Shape

- Frontend: Vite + React + TypeScript.
- Styling: Tailwind CSS with app-level styles in `src/styles.css`.
- Charts: ECharts through the reusable `src/components/Chart.tsx` wrapper.
- Data model: `TokenEvent` and filters live in `src/types.ts`.
- Analytics helpers: grouping, summaries, formatting, timeseries, and heatmap logic live in `src/lib/analytics.ts`.
- Data loading: `src/lib/storage.ts` loads generated local data from `/local-data/token-events.json` and falls back to demo data from `src/data/demoEvents.ts`.
- Collector: `scripts/collect-local-data.mjs` scans local Codex and Claude Code JSONL logs and writes `public/local-data/token-events.json`.

## Local Data And Privacy

- The app has no backend, auth, cloud sync, or database.
- Generated local data is dashboard metadata only: timestamps, local project names, tool/provider/model names, token counts, estimated cost, status, and latency.
- Do not add prompts, assistant messages, file contents, tool output, secrets, API keys, or raw session logs to generated dashboard data.
- `public/local-data/token-events.json` is user-local generated output and should stay ignored by git.
- Keep demo data realistic enough for UI development, but do not use real private user data in committed fixtures.

## Common Commands

- Install dependencies: `npm install`
- Collect local usage data: `npm run collect`
- Start dev server: `npm run dev`
- Build for production: `npm run build`
- Preview production build: `npm run preview`

## Development Guidelines

- Prefer small, focused changes that match the existing React component and helper-module structure.
- Keep analytics transformations in `src/lib/analytics.ts` unless UI state or rendering truly requires otherwise.
- Keep data-source and validation behavior in `src/lib/storage.ts`.
- Preserve the local-first behavior: the dashboard must work with demo data when no generated local data exists.
- When changing collector output, update the `TokenEvent` type, storage validation, analytics helpers, and README flow together as needed.
- Run `npm run build` before committing changes that touch TypeScript, React components, collector output shape, or build config.

## Git Workflow

- After repository changes, review `git status` and the diff for the files you touched before committing.
- Commit only related changes with a clear message.
- Push the current branch after committing unless the user explicitly asks not to.
