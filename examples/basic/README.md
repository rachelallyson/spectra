# Basic Spectra example

A minimal end-to-end demo: define a catalog, register a console publisher,
push a request through `AsyncLocalStorage`-backed context, run a fake job
through a lifecycle wrapper, and route a thrown error.

## Run it

```bash
cd examples/basic
pnpm install
pnpm start
```

You should see a series of structured-JSON lines on stderr — one per
emitted event. Order:

```
{"event":"app.started", ...}
{"event":"job.run.started", ...}
{"event":"user.signed_up", ...}
{"event":"job.run.succeeded", ...}
```

## What this shows

- `defineCatalog` — schemas as the single source of truth.
- `consolePublisher` — drop-in dev publisher.
- `createContext<T>()` — request-scoped data, set once at the edge.
- `createWrappers` → `withJobEvents` — uniform `started/succeeded/failed`
  emission around any async function.
- `captureError` — error pathway, separate from `emit()`.

## What to read next

- [Concepts](../../docs/concepts.md) — why the catalog/publisher split exists.
- [Recipes](../../docs/recipes.md) — tRPC, Inngest, Vitest setup.
- [API](../../docs/api.md) — every export.
