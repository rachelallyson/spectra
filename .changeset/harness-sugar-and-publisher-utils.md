---
'@rachelallyson/spectra': minor
---

Test-harness sugar and composable publisher wrappers.

- `harness.expectEmitted(name, partialPayload?)` — assert at least one
  event of `name` was emitted, optionally matching a payload subset.
  Cleaner than `findFirst` + manual `expect()` for the common case.
- `harness.never(name)` — assert the event was *not* emitted. Useful
  for guarding against regressions where an event leaks out of a code
  path it shouldn't.
- `sampledPublisher(rate, inner, { keep?, random? })` — wrap any
  publisher to forward only a fraction of events. Optional `keep`
  predicate forces specific events through (e.g. always send failures
  while sampling successes).
- `redactingPublisher(paths, inner, { replacement? })` — clone each
  payload and scrub the listed dotted paths before fan-out. Top-level
  and nested keys both supported.
- New isomorphic subpath `@rachelallyson/spectra/publisher-utils`
  (also re-exported from the root entry).
