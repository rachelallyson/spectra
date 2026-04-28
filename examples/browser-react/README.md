# Spectra browser example (React + Vite)

Demonstrates the browser-side flow:

- One file ([src/observability.ts](./src/observability.ts)) defines the catalog and wires publishers.
- `coveragePublisher` tallies hits in memory.
- `httpPublisher` POSTs raw events in batches (every 50 events or 2s).
- `redactingPublisher` scrubs `email` from `auth.signed_in` before HTTP fan-out.
- `tag()` marks `auth.signed_in` as `pii: medium` — server-side coverage merging can group by PII level.
- On `visibilitychange === 'hidden'`, `navigator.sendBeacon` ships the coverage snapshot before the page tears down.

## Run it

```bash
cd examples/browser-react
pnpm install
pnpm dev
```

Open the browser dev tools network tab. Click a few buttons and you'll
see `/api/events` POSTed in batches; close the tab and you'll see one
`/api/coverage` go out via beacon.

## What the server side looks like

The server collector — see [examples/server-trpc-otel](../server-trpc-otel/) —
exposes:

- `POST /api/events` — append to a JSONL log; pass each event through a
  server-side `coveragePublisher` so the server's tally and the
  browser's tally are mergeable.
- `POST /api/coverage` — store the browser snapshot in memory.

At report time:

```ts
const merged = mergeCoverage([serverCoverage.snapshot(), ...browserSnapshots])
const report = summarizeCoverage(merged, catalog.eventNames as string[])
console.log(formatCoverageSummary(report))
```

See [docs/browser-coverage.md](https://rachelallyson.github.io/spectra/browser-coverage)
for the full pattern.
