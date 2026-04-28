---
'@rachelallyson/spectra': minor
---

Add `parseEventBatch` for browser → server event ingestion.

Server endpoints that receive batched events from `httpPublisher`
have to reimplement the same three things: validate the batch shape,
look up each event's schema, run `.parse()` and accumulate
accepted/rejected counts. `parseEventBatch` collapses that into one
function:

```ts
import { parseEventBatch } from '@rachelallyson/spectra/ingest'

export async function POST(request: Request) {
  const { accepted, rejected } = parseEventBatch(
    ClientEventSchemas,
    await request.json().catch(() => null),
  )

  if (rejected.length > 0) {
    captureError(new Error(`${rejected.length} client events rejected`), {
      rejected: rejected.slice(0, 10),
    })
  }

  for (const evt of accepted) clientCatalog.emit(evt.name, evt.payload)

  return Response.json({ accepted: accepted.length, rejected: rejected.length })
}
```

`rejected` entries have structured reasons (`'unknown_event'`,
`'schema_mismatch'`, `'malformed'`, `'rate_limited'`) so logs tell you
what failed without grepping. `maxEvents` (default 1000) caps batch
size — anything beyond is dropped with `'rate_limited'` so a single
oversized POST can't degrade a worker.

Pure validation, no I/O, no re-emission. Pair with a server-side
catalog and `fileSinkPublisher` to get the durable JSONL log without
hand-rolling the file write. Built on the new structural `Validator<T>`
so non-Zod schema maps work too.

New isomorphic subpath `@rachelallyson/spectra/ingest`. 367 B brotlied.
