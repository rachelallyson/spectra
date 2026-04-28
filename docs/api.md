# API Reference

Every export with its signature.

## `defineCatalog(schemas, options?)`

```ts
function defineCatalog<TMap extends SchemaMap>(
  schemas: TMap,
  options?: CatalogOptions<TMap>,
): Catalog<TMap>

interface CatalogOptions<TMap> {
  /** Route publisher errors to Sentry, etc. Default: console.error. */
  onPublisherError?: (info: { publisher; event; error }) => void
  /** 'strict' (default), 'off', or a per-emit decision function. */
  validate?: ValidationMode<TMap>
}

type ValidationMode<TMap> =
  | 'strict'  // every emit runs the Zod schema (default)
  | 'off'     // skip Zod entirely; payload forwarded as-is
  | (<N extends keyof TMap>(name: N, payload: unknown) => boolean)
```

Unknown event names always throw with a "Did you mean…?" suggestion,
even with `validate: 'off'` — the name check is the most valuable
part of strict-mode parity for catching typos.

Returns a typed emitter bundle:

```ts
interface Catalog<TMap> {
  schemas: TMap
  eventNames: ReadonlyArray<keyof TMap>
  emit: <N extends keyof TMap>(name: N, payload: z.infer<TMap[N]>) => void
  emitAsync: <N extends keyof TMap>(name: N, payload: z.infer<TMap[N]>) => Promise<void>
  setPublishers: (next: Publisher<TMap>[]) => void
  getPublishers: () => readonly Publisher<TMap>[]
  __reset: () => void  // tests only
}
```

`emit` is fire-and-forget; publisher errors are swallowed and logged.
`emitAsync` awaits every publisher so caller can detect transport
failures.

## Publishers

```ts
interface Publisher<TMap> {
  name: string
  filter?: (event: CatalogEvent<TMap>) => boolean
  publish: (event: CatalogEvent<TMap>) => void | Promise<void>
}
```

**`consolePublisher()`** — JSON to stderr. Default for development.

**`memoryPublisher()`** — buffered, returns `{ capture(): Event[], clear() }`.
Used by the test harness; rarely registered directly.

**`fileSinkPublisher(filePath)`** — appends one JSON line per event.
Pair with `reportCoverage` for catalog-coverage reports. Node-only; import
from `@rachelallyson/spectra/publishers/node`.

## Schema helpers

Import from `@rachelallyson/spectra` or `@rachelallyson/spectra/schemas`.

```ts
function withBase<TBase extends ZodObject, TEvents>(
  base: TBase,
  events: TEvents,
): { [K in keyof TEvents]: ZodObject<TBase['shape'] & TEvents[K]['shape']> }

function mergeSchemas<T extends SchemaMap[]>(...maps: T): T[number]
```

`withBase(base, events)` merges `base`'s shape into every entry —
useful for shared envelope fields (`requestId`, `tenantId`, `env`).
`mergeSchemas(...maps)` combines per-domain schema maps; throws on
duplicate keys.

## HTTP publisher

```ts
function httpPublisher<TMap>(options: {
  url: string
  fetch?: typeof fetch
  batch?: { maxSize?: number; maxIntervalMs?: number }
  useBeacon?: boolean   // browser sendBeacon on visibilitychange
  headers?: Record<string, string>
  onError?: (err: unknown) => void
}): Publisher<TMap> & { flush(): Promise<void> }
```

Isomorphic. `flush()` drains the buffer and clears the timer.

## Publisher utilities

Import from `@rachelallyson/spectra` or `@rachelallyson/spectra/publisher-utils`.

```ts
function sampledPublisher<TMap>(
  rate: number,                          // 0..1
  inner: Publisher<TMap>,
  options?: {
    keep?: (event: CatalogEvent<TMap>) => boolean
    random?: () => number
  },
): Publisher<TMap>

function redactingPublisher<TMap>(
  paths: string[],                       // dot-separated, e.g. 'user.email'
  inner: Publisher<TMap>,
  options?: { replacement?: unknown },
): Publisher<TMap>
```

Both wrap any other publisher and compose freely.

## OTel publisher

Import from `@rachelallyson/spectra/otel`. `@opentelemetry/api` is an
optional peer.

```ts
function otelPublisher<TMap>(options: {
  trace: import('@opentelemetry/api').TraceAPI
  namePrefix?: string                    // default 'spectra.'
  maxDepth?: number                      // default 3
  encode?: (event) => Record<string, AttrValue>
}): Publisher<TMap>
```

Adds a span event on the active span. Outside a span: silent no-op.

## Request context

```ts
function createContext<T extends BaseRequestContext>(): RequestContextStore<T>
```

Where `BaseRequestContext` requires `requestId: string` and `T` adds
your app's fields.

```ts
interface RequestContextStore<T> {
  with<R>(ctx: T, fn: () => R): R
  current(): T | undefined
  currentRequestId(): string | undefined
  update(patch: Partial<T>): void
}
```

## Error pathway

```ts
function captureError(err: unknown, context?: ErrorContext): void
function setErrorSink(sink: ErrorSink): void

type ErrorSink = (err: unknown, context: ErrorContext) => void
interface ErrorContext { requestId?: string; [key: string]: unknown }
```

Default sink writes JSON to stderr. Replace with your Sentry adapter at
boot.

## Lifecycle wrappers

```ts
function createWrappers<TMap>(config: {
  catalog: Catalog<TMap>
  procedure: { started: keyof TMap; succeeded: keyof TMap; failed: keyof TMap }
  job: { started: keyof TMap; succeeded: keyof TMap; failed: keyof TMap }
}): {
  withProcedureEvents: <TArgs extends unknown[], TResult>(
    procedureName: string,
    fn: (...args: TArgs) => Promise<TResult>,
    payloadFor?: { start?: ...; success?: ...; failure?: ... },
  ) => (...args: TArgs) => Promise<TResult>
  withJobEvents: <TArgs extends unknown[], TResult>(
    jobName: string,
    fn: (...args: TArgs) => Promise<TResult>,
  ) => (...args: TArgs) => Promise<TResult>
}
```

Both wrap an async function and emit the start/success/fail events with
duration timing. `withProcedureEvents` accepts optional `payloadFor`
callbacks for adding domain-specific fields.

## Test harness

```ts
function createTestHarness<TMap>(catalog: Catalog<TMap>): TestHarness<TMap>

interface TestHarness<TMap> {
  install(testName: string): void
  uninstall(): void
  captured(): CatalogEvent<TMap>[]
  expectSequence(expected: Array<keyof TMap>, opts?: { allowGaps?: boolean }): void
  expectEmitted<N>(name: N, payload?: Partial<TMap[N]>): void
  never<N>(name: N): void
  findFirst<N>(name: N): CatalogEvent<TMap, N> | undefined
  coverageReport(): { hit: ...; missed: ... }
  assertFullCoverage(allowMissing?: Array<keyof TMap>): void
  writeMarkdownReport(filePath: string): void
  resetCoverage(): void
}
```

`install()` snapshots the existing publisher list and prepends the
harness's own publishers — so any pre-registered sink (e.g. a per-worker
`fileSinkPublisher` from a vitest setup) keeps receiving events during
tests. `uninstall()` restores the original list.

`expectEmitted` checks for at least one matching event, optionally with
a partial payload; `never` asserts the event was *not* emitted.

## Coverage (isomorphic)

```ts
function coveragePublisher<TMap>(): Publisher<TMap> & {
  snapshot(): Record<string, number>
  reset(): void
}

function mergeCoverage(snapshots: Record<string, number>[]): Record<string, number>

function summarizeCoverage(
  snapshot: Record<string, number>,
  catalogNames: string[],
  allowMissing?: string[],
): CoverageReport

function formatCoverageSummary(report: CoverageReport): string

interface CoverageReport {
  total: number
  hit: Array<{ name: string; count: number }>
  missed: string[]
}
```

Tally hits in memory on either side of the wire. Browser ships its
`snapshot()` to the server (e.g. via `navigator.sendBeacon`); server merges
with its own snapshot via `mergeCoverage`, then `summarizeCoverage` against
the catalog. `formatCoverageSummary` returns a one-liner like
`Coverage: 12/15 (80%) — missed: foo, bar, …` for logs or CI annotations.

## Coverage report (Node-only)

Import from `@rachelallyson/spectra/coverage-report`.

```ts
function reportCoverage(opts: {
  jsonlPath: string
  markdownPath: string
  schemas?: SchemaMap
  catalogNames?: string[]
  allowMissing?: string[]
  suiteName?: string
}): CoverageReport
```

Reads a JSONL event log written by `fileSinkPublisher`, counts hits per
event name, writes a markdown report.

## Type exports

- `Catalog<TMap>`
- `CatalogEvent<TMap, N>`
- `SchemaMap`
- `Publisher<TMap>`
- `BaseRequestContext`, `RequestContextStore<T>`
- `ErrorContext`, `ErrorSink`
- `CoverageEntry`, `CoverageReport`
- `SequenceMatchOptions`
