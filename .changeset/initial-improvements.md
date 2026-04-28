---
'@rachelallyson/spectra': minor
---

Add `httpPublisher`, `coveragePublisher`, did-you-mean hints on unknown
events, and an `onPublisherError` hook on `defineCatalog`.

- `httpPublisher(options)` — isomorphic publisher that POSTs events
  (single or batched, by size and/or interval) and uses
  `navigator.sendBeacon` on `visibilitychange === 'hidden'` so pending
  events ship before the page tears down. Pair with `coveragePublisher`
  to forward browser tallies to a server collector.
- `coveragePublisher()` — isomorphic, tallies hits per event name in
  memory; `mergeCoverage([...])` combines snapshots from multiple
  sources; `summarizeCoverage(snapshot, names)` produces a hit/miss
  report; `formatCoverageSummary(report)` returns a one-liner suitable
  for CI annotations.
- Unknown event names now suggest the closest catalog entry
  (`Did you mean "user.signed_in"?`) via Levenshtein with early exit.
- `defineCatalog(schemas, { onPublisherError })` accepts an optional
  hook so publisher failures can route to Sentry instead of the default
  `console.error`. Existing call sites are unaffected.
