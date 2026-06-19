# AGENTS.md — adapter-calendar

Orientation for AI agents (and humans) working on this repository.

## What this is

A transient, memory-less converter between the Pryv.io API and the iCalendar
standard ([RFC 5545](https://www.rfc-editor.org/rfc/rfc5545)). It holds no
canonical user data: per-user mapping configuration lives on the user's own Pryv
account as ordinary events and is fetched on each request. It is designed to run
alongside a Pryv core (sidecar) or, later, as a multi-tenant service.

## Stack

- **TypeScript**, **Node.js ≥ 24**, **pure ESM** (`"type": "module"`).
- Node runs the `.ts` sources directly via native type stripping — there is no
  mandatory build step for development or tests. Relative imports therefore use
  explicit `.ts` extensions (e.g. `import { banner } from '../src/index.ts'`).
- `tsc` is used for type checking (`--noEmit`) and to produce a publishable
  `dist/` build; it is **not** part of the run/test loop.
- Tests use the **built-in Node test runner** (`node --test`) with
  `node:assert/strict` — no external test framework.
- Linting: **neostandard** (StandardJS style) with semicolons, plus
  `typescript-eslint`.

## Commands

[`just`](https://github.com/casey/just) is the task runner; each recipe maps to
an npm script, so `npm run <name>` works too.

| Task | `just` | npm |
|---|---|---|
| Install deps | `just install` | `npm install` |
| Lint | `just lint` | `npm run lint` |
| Lint + autofix | `just lint-fix` | `npm run lint:fix` |
| Type check | `just typecheck` | `npm run typecheck` |
| Test | `just test` | `npm test` |
| Build to `dist/` | `just build` | `npm run build` |
| Run from source | `just start` | `npm start` |
| Apply license headers | `just license` | `npm run license` |

## Conventions

- Semicolons required; StandardJS otherwise.
- Every source/test file carries a BSD-3-Clause header applied by
  `just license` (config in `.licenser.yml`). Run it before committing new
  files.
- Default branch is `master`. CI (`.github/workflows/ci.yml`) runs lint,
  typecheck, test and build on every push and pull request.

## Layout

```
src/ical/       RFC 5545 serializer (pure)
src/feed/       envelope codec, mapping model, feed request handler (pure/injected)
src/ui/         mapping-creation handler + static web UI (assets/)
src/pryv/       Pryv client port (types.ts) + lib-js implementation (client.ts)
src/server.ts   node:http server (feed + UI routes)
test/           Node test-runner specs (*.test.ts)
docs/           design notes (e.g. url-length-constraints.md)
dist/           Build output (generated, gitignored)
.licenser.yml   License-header configuration
```

The only module that imports `pryv` (lib-js) is `src/pryv/client.ts`; everything else
depends on the `PryvClient` interface in `src/pryv/types.ts`, so the handler and server
are unit-tested without a network.
