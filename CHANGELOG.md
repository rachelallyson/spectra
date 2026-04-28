# Changelog

## 0.3.1

### Patch Changes

- [`c607fdb`](https://github.com/rachelallyson/spectra/commit/c607fdb412486f11b82cf3a542e8f78f2075dfbb) Thanks [@rachelallyson](https://github.com/rachelallyson)! - Fix: `harness.install()` no longer evicts publishers registered before
  it ran. Previously the harness called `catalog.setPublishers([memory,
coverage-tracker])`, replacing any pre-registered sink — most notably a
  per-worker `fileSinkPublisher` wired by a vitest setup file. Every event
  emitted from any test that touched the harness silently dropped from
  that sink for the rest of the worker's lifetime, and the post-suite
  coverage report came out missing every test that ran the harness.

  Now `install()` snapshots the existing publisher list, prepends it to
  the harness's own publishers, and `uninstall()` restores the original
  list. Behavior when the catalog had no prior publishers is unchanged.

## 0.3.0

### Minor Changes

- [`1b32166`](https://github.com/rachelallyson/spectra/commit/1b321669d526dbf265a8c1fb2c2343ac67d14886) Thanks [@rachelallyson](https://github.com/rachelallyson)! - Add `httpPublisher`, `coveragePublisher`, did-you-mean hints on unknown
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

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-04-27

### Fixed

- Compiled output now uses explicit `.js` extensions on relative imports, so
  the package actually loads under Node ESM. `0.2.0` (and `0.1.0`) were
  broken at runtime — `import '@rachelallyson/spectra'` threw
  `ERR_MODULE_NOT_FOUND` on the internal `./catalog` import. Upgrade to
  `0.2.1`; do not use `0.2.0`.

## [0.2.0] - 2026-04-27

### Added

- `coveragePublisher()` — isomorphic publisher that tallies hit counts per
  event name in memory and exposes `snapshot()` / `reset()`. Snapshots
  serialize as plain `Record<string, number>`, so a browser can ship its
  tally to a server (sendBeacon, fetch) for merged coverage reporting.
- `mergeCoverage(snapshots[])` — sum tallies from multiple sources.
- `summarizeCoverage(snapshot, names, allowMissing?)` — reduce a tally to a
  hit/miss `CoverageReport`. Pure; no I/O.
- `formatCoverageSummary(report)` — one-line summary suitable for
  `console.log` or a CI annotation, e.g. `Coverage: 12/15 (80%) — missed: …`.
- New isomorphic subpath `@rachelallyson/spectra/coverage` (also re-exported
  from the root entry).

### Changed

- `fileSinkPublisher` moved to a Node-only subpath. The core entrypoint
  (`@rachelallyson/spectra`) and `./publishers` no longer pull in `node:fs` or
  `node:path`, making them safe to bundle for the browser. `consolePublisher`
  and `memoryPublisher` remain isomorphic.
- `buildCoverageReport` and friends now share their tally→report logic with
  the new `summarizeCoverage` helper.

### BREAKING

- `fileSinkPublisher` is no longer exported from `@rachelallyson/spectra` or
  `@rachelallyson/spectra/publishers`. Update imports:

  ```diff
  - import { fileSinkPublisher } from '@rachelallyson/spectra'
  + import { fileSinkPublisher } from '@rachelallyson/spectra/publishers/node'
  ```

- `buildCoverageReport`, `reportCoverage`, and `writeCoverageMarkdown` are
  no longer exported from the root entry — they pull in `node:fs`. Import
  them from the existing Node-only subpath:

  ```diff
  - import { reportCoverage } from '@rachelallyson/spectra'
  + import { reportCoverage } from '@rachelallyson/spectra/coverage-report'
  ```

  Server-only code is unaffected at runtime — only the import path changes.
  Note: `./context` (AsyncLocalStorage) and `./test-harness` are still
  Node-only and were never browser-safe.

## [0.1.0] - 2026-04-27

### Added

- Initial release.
- `defineCatalog(schemas)` — typed emitter factory.
- Publishers: `consolePublisher`, `memoryPublisher`, `fileSinkPublisher`.
- `createContext<T>()` — AsyncLocalStorage request-context store.
- `captureError` + `setErrorSink` — error pathway separate from `emit()`.
- `createWrappers({ catalog, procedure, job })` — uniform start/succeed/fail
  emission for tRPC procedures and Inngest jobs.
- `createTestHarness(catalog)` — `expectSequence`, `findFirst`,
  `assertFullCoverage`, markdown report writer.
- `reportCoverage({...})` — read JSONL event log + write coverage markdown.
- Documentation: README, getting-started, concepts, recipes (tRPC, Inngest,
  vitest), API reference.
