# Changelog

All notable changes to this project will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
