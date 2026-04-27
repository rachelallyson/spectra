# Spectra

> Typed observability primitives for TypeScript apps. Bring your own
> catalog; Spectra handles the rest.

[![npm version](https://img.shields.io/npm/v/@rachelallyson/spectra.svg)](https://www.npmjs.com/package/@rachelallyson/spectra)
[![docs](https://img.shields.io/badge/docs-rachelallyson.github.io%2Fspectra-5f4fff)](https://rachelallyson.github.io/spectra/)
[![License](https://img.shields.io/npm/l/@rachelallyson/spectra.svg)](./LICENSE)

📚 **Docs:** https://rachelallyson.github.io/spectra/

Spectra is a tiny library for app-wide observability built around the
[Capital One Stratum-Observability](https://github.com/capitalone/Stratum-Observability)
patterns: a typed catalog as the single source of truth, runtime-validated
`emit()`, and publisher fan-out to whatever vendors you use. No runtime
dependencies (zod is a peer); ~600 lines of TypeScript; full IDE
autocomplete on every event.

```ts
import { defineCatalog, consolePublisher } from '@rachelallyson/spectra'
import { z } from 'zod'

const catalog = defineCatalog({
  'app.started': z.object({ env: z.string(), version: z.string() }),
  'guest.created': z.object({ tenantId: z.string(), guestId: z.string() }),
})

catalog.setPublishers([consolePublisher()])

catalog.emit('app.started', { env: 'production', version: '1.0.0' })
//                            ^ TypeScript and Zod both validate this
```

## Why

Most observability is unstructured `console.log` plus whatever Sentry sees.
That works until it doesn't — and when it doesn't, you spend an hour
grepping logs for the one signal that would have closed the case in
seconds.

The Stratum pattern fixes this by making every observable behavior a
named, typed entry in a catalog. The catalog becomes the contract: every
emit validates against it, tests assert sequences against it, and a
coverage report flags which catalog entries no test ever exercises.

Spectra ships the patterns, not the framework. ~600 lines, no runtime
dependencies, full type safety, designed to be read in one sitting.

## Features

- **Typed catalog factory** — `defineCatalog(schemas)` returns a fully-
  typed emitter. TS rejects bad event names; Zod validates payloads at
  runtime.
- **Publishers** — `console`, `memory` (for tests), `fileSink` (for
  coverage reports). Bring your own for Sentry / Axiom / PostHog.
- **Request context** — `createContext<T>()` returns an AsyncLocalStorage
  store generic over your app's shape. Set once at the edge, read anywhere.
- **Error pathway** — `captureError` is intentionally separate from
  `emit()`. Events describe things that happened; errors describe things
  that went wrong. Sentry is the right place for the latter.
- **Lifecycle wrappers** — `createWrappers({ catalog, procedure, job })`
  emits `started/succeeded/failed` around any async function. Drop one
  middleware on tRPC, wrap your Inngest handlers, get uniform signal.
- **Test harness** — `expectSequence(['a.started', 'a.succeeded'])` for
  flow tests; `assertFullCoverage([...])` for catalog backstop.
- **Coverage report** — Vitest globalTeardown reads a JSONL event log and
  writes `obs-coverage.md` so PR diffs surface drift.

## Install

```bash
pnpm add @rachelallyson/spectra zod
# or: npm install @rachelallyson/spectra zod
```

Node 18+. Zod 3 or 4 works.

## Documentation

- [Getting Started](./docs/getting-started.md) — install + first events
- [Concepts](./docs/concepts.md) — catalog, publishers, context, error pathway
- [Recipes](./docs/recipes.md) — tRPC, Inngest, Vitest setup, vendor adapters
- [API Reference](./docs/api.md) — every export with signatures
- [Examples](./examples/) — runnable sample apps

## Inspiration

- Capital One's [Stratum-Observability](https://github.com/capitalone/Stratum-Observability)
  for the catalog + publisher patterns.
- [OpenTelemetry](https://opentelemetry.io/) for the request-context discipline.

Spectra deliberately doesn't try to replace OpenTelemetry — it's the
typed-events-and-business-state layer that sits *above* OTel traces and
metrics.

## License

[MIT](./LICENSE)
