# Changelog

## 0.5.0

### Minor Changes

- [`f957359`](https://github.com/rachelallyson/spectra/commit/f95735933dc370c1f76344f174b394ed56c49105) Thanks [@rachelallyson](https://github.com/rachelallyson)! - OTel publisher: also call `span.recordException()` on `*.failed`
  events (and any predicate you supply).

  Linking the exception to the span lets your APM stitch together "this
  span errored, here's what." The default predicate matches event names
  ending in `.failed` — the convention `createWrappers` produces — but
  you can opt in or out with `recordExceptionOn`:

  ```ts
  otelPublisher({
    trace,
    recordExceptionOn: (event) => event.meta?.severity === "error",
  });
  ```

  The exception's message comes from `event.payload.errorMessage` when
  present (lifecycle wrappers set this), otherwise the entire payload
  is JSON-stringified.

  Also: `OtelTraceApi` is now `TraceAPI` from `@opentelemetry/api`
  directly, instead of a hand-rolled subset. The previous local
  interface had a structural mismatch with OTel's real `Span.addEvent`
  signature — the example app caught it on first typecheck.

## 0.4.0

### Minor Changes

- [`4632f05`](https://github.com/rachelallyson/spectra/commit/4632f051d1ff92dcb5991ff3b4676ff40ab83c46) Thanks [@rachelallyson](https://github.com/rachelallyson)! - Wrappers now distinguish AbortSignal cancellations from real failures.

  When the wrapped function rejects with an `AbortError`,
  `createWrappers` emits the `*.failed` event with `errorKind: 'aborted'`
  and _skips_ `captureError()` — aborts aren't bugs and shouldn't page
  your on-call.

  Also exports `isAbortError(err)` for use in your own catch sites.

  ```ts
  import { isAbortError } from "@rachelallyson/spectra";

  try {
    await fetch(url, { signal });
  } catch (err) {
    if (isAbortError(err)) return; // user navigated away; not an error
    throw err;
  }
  ```

- [`16e6365`](https://github.com/rachelallyson/spectra/commit/16e6365e7dc8ebbc90a003bc765ce46e54bd6280) Thanks [@rachelallyson](https://github.com/rachelallyson)! - Add validation modes and schema-composition helpers.

  - `defineCatalog(schemas, { validate })` accepts `'strict'` (default,
    unchanged), `'off'` (skip Zod, forward payload as-is), or a
    `(name, payload) => boolean` predicate for sampled validation in
    production. Unknown event names always throw with a "Did you mean…?"
    hint regardless of mode.
  - `withBase(base, events)` (new, isomorphic) merges a base Zod object
    into every entry of a schema map — for shared envelope fields
    (`requestId`, `tenantId`, `env`) without repeating `.extend(...)` on
    each entry.
  - `mergeSchemas(...maps)` (new, isomorphic) combines per-domain schema
    maps into one and throws on duplicate keys, so feature modules can
    own their own catalogs without flattening by hand.
  - New isomorphic subpath `@rachelallyson/spectra/schemas` (also
    re-exported from the root entry).

- [`51010dd`](https://github.com/rachelallyson/spectra/commit/51010dd0f5f60d4603b80c497131b455bb19c819) Thanks [@rachelallyson](https://github.com/rachelallyson)! - Event-level metadata: `tag()`, `getMeta()`, `event.meta`,
  `routeByMeta()`.

  Mark catalog schemas with arbitrary metadata (PII level, retention
  class, fan-out destination) and let publishers route on it instead of
  hard-coding paths or predicates.

  ```ts
  import { defineCatalog, tag, routeByMeta } from '@rachelallyson/spectra'

  const catalog = defineCatalog({
    'auth.signed_in': tag(z.object({ userId: z.string() }), { pii: 'medium' }),
    'billing.charged': tag(z.object({ ... }), { pii: 'high', retention: 'short' }),
  })

  catalog.setPublishers([
    routeByMeta((m) => m?.pii !== 'high', posthog),  // skip high-PII to PostHog
    datadog,                                          // everything to Datadog (in VPC)
  ])
  ```

  Storage is a module-scoped `WeakMap`, so tagging doesn't mutate the
  schema or break Zod's internals. `event.meta` is populated at emit
  time and is `Readonly` (frozen). New isomorphic subpath
  `@rachelallyson/spectra/metadata`.

- [`5a70e5f`](https://github.com/rachelallyson/spectra/commit/5a70e5f2382853fe7dcb1f7cddf6e7413472c2c7) Thanks [@rachelallyson](https://github.com/rachelallyson)! - Test-harness sugar and composable publisher wrappers.

  - `harness.expectEmitted(name, partialPayload?)` — assert at least one
    event of `name` was emitted, optionally matching a payload subset.
    Cleaner than `findFirst` + manual `expect()` for the common case.
  - `harness.never(name)` — assert the event was _not_ emitted. Useful
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

- [`b1361f2`](https://github.com/rachelallyson/spectra/commit/b1361f2c7ba7594869c68dabecb1785af80f99ab) Thanks [@rachelallyson](https://github.com/rachelallyson)! - Add an OpenTelemetry bridge: `otelPublisher` ships every catalog event
  as a span event on the active span, so traces in your APM (Honeycomb,
  Datadog APM, Tempo) include the structured event with flattened
  attributes.

  `@opentelemetry/api` is declared as an _optional peer_. The publisher
  takes the `trace` API as a parameter — apps that don't use OTel
  neither install the peer nor import the subpath. New subpath
  `@rachelallyson/spectra/otel`.

  ```ts
  import { trace } from "@opentelemetry/api";
  import { otelPublisher } from "@rachelallyson/spectra/otel";

  catalog.setPublishers([consolePublisher(), otelPublisher({ trace })]);
  ```

  Outside an active span the publisher is a silent no-op (span events
  without a span aren't a thing in OTel).

- [`19a2696`](https://github.com/rachelallyson/spectra/commit/19a2696a6fa8f504970cdf2616c7a1d3e85845cd) Thanks [@rachelallyson](https://github.com/rachelallyson)! - Validator pluggability: schemas no longer have to be Zod.

  The catalog now uses a structural `Validator<T>` interface
  (`{ parse(input: unknown): T }`) instead of `z.ZodTypeAny`. Zod schemas
  satisfy this shape — existing call sites are unaffected — but Valibot,
  Effect Schema, and hand-rolled guards work too.

  ```ts
  const catalog = defineCatalog({
    "app.boot": {
      parse(input: unknown): { env: string } {
        // your validation
        return input as { env: string };
      },
    },
  });
  ```

  New exported types: `Validator<T>`, `Output<V>` (extracts the parse
  return type — stand-in for Zod's `z.infer`).

  `@rachelallyson/spectra` no longer carries any `import 'zod'` in its
  compiled output. Zod remains a _type-time_ peer dep so the d.ts
  referenced in user code resolves; required at the type level, optional
  at runtime.

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
