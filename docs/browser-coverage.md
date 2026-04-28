# Browser → server coverage and event collection

Catalog coverage is the simplest way to keep your event taxonomy
honest: every catalog entry should be exercised by at least one test
or one real user interaction. On the server that's a JSONL file plus
`reportCoverage`. The browser can't write JSONL — but it doesn't need
to.

The pattern: the browser tallies hit counts in memory and POSTs the
tally to a small server endpoint, which merges it with the server's
own tally and renders the unified report.

## The browser side

```ts
import {
  coveragePublisher,
  consolePublisher,
  defineCatalog,
  httpPublisher,
} from '@rachelallyson/spectra'

const catalog = defineCatalog(schemas)
const coverage = coveragePublisher<typeof schemas>()

catalog.setPublishers([
  consolePublisher(),
  coverage,
])

// Ship the tally on page hide. `httpPublisher` handles sendBeacon
// for you, but for a pure tally a single fetch is enough.
addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return
  navigator.sendBeacon(
    '/api/coverage',
    JSON.stringify(coverage.snapshot()),
  )
})
```

`coverage.snapshot()` returns `Record<string, number>` — event name to
hit count. Cheap to serialize, cheap on the wire.

## The server side

```ts
import {
  mergeCoverage,
  summarizeCoverage,
  formatCoverageSummary,
  defineCatalog,
  coveragePublisher,
  type CoverageSnapshot,
} from '@rachelallyson/spectra'

const catalog = defineCatalog(schemas)
const serverCoverage = coveragePublisher<typeof schemas>()
catalog.setPublishers([serverCoverage])

// Browser POSTs land here.
const browserSnapshots: CoverageSnapshot[] = []

app.post('/api/coverage', (req, res) => {
  browserSnapshots.push(req.body as CoverageSnapshot)
  res.status(204).end()
})

// At report time — usually a cron, or end of vitest run, or `/_health/coverage`.
function reportNow() {
  const merged = mergeCoverage([
    serverCoverage.snapshot(),
    ...browserSnapshots,
  ])
  const report = summarizeCoverage(merged, catalog.eventNames as string[])
  console.log(formatCoverageSummary(report))
  // → Coverage: 47/55 (85%) — missed: app.crash_recovered, ...
}
```

## Why a tally and not raw events

A raw event log from the browser has two problems: it's expensive on
the wire (every PII-bearing payload re-shipped), and it bloats the
server's storage. A tally is `{ "user.signed_in": 412, ... }`. Bytes
per session, not per event.

If you also want raw events from the browser (to inspect payloads, run
flow assertions, etc.), use `httpPublisher` *in addition to*
`coveragePublisher` — they're independent.

## Tying it into CI

The same flow works for synthetic browser test runs (Playwright,
Cypress). Have your synthetic suite POST its coverage snapshot at
teardown; merge it with the server's during the post-run report; fail
the build if any catalog entry has zero hits across both.

```ts
// In your post-run script:
const merged = mergeCoverage([
  serverCoverage.snapshot(),
  await fs.readFile('synthetic-coverage.json', 'utf8').then(JSON.parse),
])
const report = summarizeCoverage(merged, catalog.eventNames as string[])
if (report.missed.length > 0) {
  console.error(formatCoverageSummary(report))
  process.exit(1)
}
```

## Receiving raw events server-side

If you want raw events from the browser (not just the coverage tally),
pair `httpPublisher` on the browser with `parseEventBatch` on the
server. The pattern: validate the batch against your client schemas
(defense in depth — a browser can be tampered with), then forward
accepted events through a server-side catalog so your existing
publishers (file sink, OTel, redacting) see them.

```ts
// Browser:
import { defineCatalog, httpPublisher } from '@rachelallyson/spectra'
import { ClientEventSchemas } from './client-schemas'

const catalog = defineCatalog(ClientEventSchemas)
catalog.setPublishers([
  httpPublisher({
    url: '/api/events',
    batch: { maxIntervalMs: 2000, maxSize: 50 },
  }),
])
```

```ts
// Server (Next.js route handler shown; any framework works):
import { parseEventBatch } from '@rachelallyson/spectra/ingest'
import { fileSinkPublisher } from '@rachelallyson/spectra/publishers/node'
import { defineCatalog, captureError } from '@rachelallyson/spectra'
import { ClientEventSchemas } from '@/lib/observability/client-schemas'

// One catalog for the client vocabulary; one publisher does the JSONL.
const clientCatalog = defineCatalog(ClientEventSchemas)
clientCatalog.setPublishers([
  fileSinkPublisher('./obs-coverage/client-events.jsonl'),
])

export async function POST(request: Request) {
  const { accepted, rejected } = parseEventBatch(
    ClientEventSchemas,
    await request.json().catch(() => null),
  )

  if (rejected.length > 0) {
    captureError(new Error(`${rejected.length} client events rejected`), {
      rejected: rejected.slice(0, 10),  // bound the error payload
      route: '/api/events',
    })
  }

  for (const evt of accepted) clientCatalog.emit(evt.name, evt.payload)

  return Response.json({ accepted: accepted.length, rejected: rejected.length })
}
```

`parseEventBatch` returns `{ accepted, rejected }`. Each `rejected`
entry has a structured `reason` (`'unknown_event'`, `'schema_mismatch'`,
`'malformed'`, `'rate_limited'`) so your error report tells you what
broke. `maxEvents` (default 1000) caps the per-batch size; anything
beyond that is dropped with `reason: 'rate_limited'` so a single
oversized POST can't degrade the worker.

## See also

- [`coveragePublisher`, `mergeCoverage`, `summarizeCoverage`,
  `formatCoverageSummary`](/api#coverage-isomorphic) — the API.
- [`reportCoverage`](/api#coverage-report-node-only) — the original
  JSONL-based flow, still the right answer for pure-Node test suites.
