# API Reference

Every export with its signature.

## `defineCatalog(schemas)`

```ts
function defineCatalog<TMap extends SchemaMap>(schemas: TMap): Catalog<TMap>
```

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
Pair with `reportCoverage` for catalog-coverage reports.

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
  findFirst<N>(name: N): CatalogEvent<TMap, N> | undefined
  coverageReport(): { hit: ...; missed: ... }
  assertFullCoverage(allowMissing?: Array<keyof TMap>): void
  writeMarkdownReport(filePath: string): void
  resetCoverage(): void
}
```

## Coverage report

```ts
function reportCoverage(opts: {
  jsonlPath: string
  markdownPath: string
  schemas?: SchemaMap
  catalogNames?: string[]
  allowMissing?: string[]
  suiteName?: string
}): CoverageReport

interface CoverageReport {
  total: number
  hit: Array<{ name: string; count: number }>
  missed: string[]
}
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
