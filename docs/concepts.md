# Concepts

The mental model behind Spectra in five short pieces.

## The catalog is the contract

Every observable behavior in your app is a named entry in a catalog. The
catalog is the contract between the code that emits and the code (and
humans) that read the emits.

```ts
const catalog = defineCatalog({
  'guest.created': z.object({ guestId: z.string() }),
})

catalog.emit('guest.created', { guestId: '...' })
//           ^ TS rejects unknown names
//                            ^ Zod validates payload
```

Why this matters:

- **Refactors are safe.** Renaming an event shows you every call site.
- **Tests assert against the catalog.** A flow test says "this user
  action emits these events in this order" — naming each one by the
  catalog key.
- **The catalog itself is queryable.** A coverage report can list which
  entries the suite never exercises, surfacing dead code or untested
  flows.

The discipline: **add a catalog entry first, then emit**. Never `emit()`
a string literal that isn't already in the catalog.

## Publishers fan out

A publisher is a dumb forwarder. It receives an `Event` (name + payload
+ timestamp), decides whether it cares (`filter`), and ships it to one
backend.

```ts
catalog.setPublishers([
  consolePublisher(),         // dev / fallback
  sentryBreadcrumbPublisher(),// crash context
  axiomPublisher({ token }),  // structured logs
  posthogPublisher({ key, filter: (e) => e.name.startsWith('user.') }),
])
```

Each publisher is independent — a broken transport in one doesn't kill
the others. The library swallows publisher errors by default. Use
`catalog.emitAsync` if you genuinely need to await every publisher.

## Request context propagates implicitly

Every event payload needs `requestId` so you can correlate everything
that happened during a single user action. Manually threading it through
function arguments is brittle.

`createContext<T>()` returns an AsyncLocalStorage store you can set once
at the edge:

```ts
const ctx = createContext<{ requestId: string; tenantId?: string }>()

// Edge: middleware, route handler, etc.
ctx.with({ requestId: '...' }, async () => {
  await deepNestedFunction()
})

// Anywhere downstream — same async chain:
ctx.current()         // → { requestId: '...' }
ctx.currentRequestId()
```

You decide which fields go on your context (`userId`, `tenantId`,
`traceId`, etc.) — Spectra only requires `requestId`.

## Errors are not events

`emit()` describes things that happened. `captureError(err, context)`
describes things that went wrong. They use separate pathways because:

- Errors deserve stack traces and grouping (Sentry's whole job).
- Events get noisy if every error is also an event.
- A single failure may produce one `captureError` and several events
  (e.g. `automation.run.failed` + `email.send.failed`).

```ts
import { captureError, setErrorSink } from '@rachelallyson/spectra'

// At boot — wire your error sink. Default: stderr JSON.
setErrorSink((err, context) => {
  Sentry.captureException(err, { extra: context })
})

// At a call site:
try {
  await doStuff()
} catch (err) {
  captureError(err, { requestId, tenantId })
  throw err
}
```

## Lifecycle wrappers eliminate boilerplate

Most apps want `started/succeeded/failed` emits around every tRPC
procedure and every job. Writing those manually means three `emit()`
calls per procedure — easy to forget, easy to drift.

`createWrappers` factors this out:

```ts
const { withProcedureEvents, withJobEvents } = createWrappers({
  catalog,
  procedure: {
    started: 'trpc.procedure.started',
    succeeded: 'trpc.procedure.succeeded',
    failed: 'trpc.procedure.failed',
  },
  job: {
    started: 'job.run.started',
    succeeded: 'job.run.succeeded',
    failed: 'job.run.failed',
  },
})
```

For tRPC, even better: write a single middleware that uses these names
(see [Recipes](./recipes.md)) and apply it to your base procedure. Every
procedure your app ever defines is auto-instrumented.

## Tests assert sequences

The test harness lets each test assert exactly what was emitted:

```ts
import { createTestHarness } from '@rachelallyson/spectra'
import { catalog } from './observability/catalog'

const harness = createTestHarness(catalog)

beforeEach(() => harness.install(expect.getState().currentTestName ?? ''))
afterEach(() => harness.uninstall())

it('check-in flow emits the lifecycle pair plus domain events', async () => {
  await driveTheCheckIn()
  harness.expectSequence(
    ['trpc.procedure.started', 'guest.created', 'trpc.procedure.succeeded'],
    { allowGaps: true }, // other events between is OK
  )
})
```

A separate coverage report runs after the suite and flags any catalog
entry that no test ever emitted. That's the backstop — if you add a
catalog entry but never wire it into a flow, the report tells you.
