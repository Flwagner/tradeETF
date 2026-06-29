# AGENTS.md

Guidelines for AI coding agents working on tradeETF.

## Project Shape

tradeETF is a personal React + Vite + TypeScript app for ETF momentum tracking. The production app must remain a static GitHub Pages frontend backed only by Supabase persistence and Supabase Edge Functions.

Required runtime architecture:

```text
React static app on GitHub Pages -> Supabase DB / Supabase Edge Functions
```

Do not add a required backend application server, Node API, external proxy service, server worker, or cron job for production runtime. HTTP calls blocked by browser CORS can go through Supabase Edge Functions.

Imports and database writes must remain possible from the browser UI. Do not make a local Node script or console command the primary functional path for importing ETF data.

## Local Environment

The project is developed in WSL. Run commands from the WSL shell, normally in:

```text
/home/florent/dev/perso/tradeETF
```

When `npm run dev` runs in WSL, the app is normally available from the Windows browser at:

```text
http://localhost:5173/tradeETF/
```

Do not replace Linux/WSL paths with Windows paths in project configuration.

## Commands

Use Node.js 22 or newer. The GitHub Actions workflow uses Node 22.

Use these commands before handing work back when relevant:

```bash
npm test
npm run build
npm run validate
```

`npm run validate` is the preferred final check. It runs the test suite and the production build.

Before pushing code, use the versioned pre-push skill:

```bash
.codex/skills/tradeetf-pre-push-check/scripts/pre-push-check.sh
```

This runs `npm run validate`, starts a local production preview, and checks that the app responds on the GitHub Pages base path.

## Frontend Constraints

- Keep the app compatible with GitHub Pages.
- Keep `HashRouter` and Vite `base: '/tradeETF/'` behavior unless the deployment model changes explicitly.
- Keep environment variables on the Vite public side limited to publishable Supabase values.
- The app must start without Supabase variables; persistent data and imports can be disabled in that mode.

## Supabase

- Database schema lives in `supabase/schema.sql`.
- Edge Functions live in `supabase/functions`.
- Yahoo Finance and Boursobank network calls that need server-side CORS handling should go through Edge Functions.
- Public/anon Supabase keys are acceptable in the frontend for this personal project, with RLS policies matching that assumption.

## Financial Domain Rules

The app is informational and must not present rankings as financial advice. Keep visible disclaimers aligned with this principle.

Pure financial calculations live in `src/domain`:

- `momentum.ts` contains the stable `momentum_v1` strategy.
- `trailingStop.ts` compares trailing stops at 5%, 7%, 10%, 12%, and 15%.

Important invariants:

- Sort prices chronologically before calculations.
- Use `adjustedClosePrice` when it exists and is strictly positive, otherwise use `closePrice`.
- Do not silently change `momentum_v1`. If the formula changes, treat it as a new explicit strategy version or document the intentional migration.

## Change Discipline

- Prefer small, focused changes that match the existing React, TypeScript, and service/domain structure.
- Keep deterministic business logic in `src/domain` and cover it with Vitest tests.
- Keep Supabase IO in `src/services` or Edge Functions rather than mixing network details into domain calculations.
- Avoid adding dependencies unless they clearly reduce project complexity or risk.
