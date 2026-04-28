# Changelog

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
