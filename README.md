# observability-core

Stratum-style typed observability primitives. Bring your own catalog; this
package handles the rest.

Inspired by [Capital One's Stratum-Observability](https://github.com/capitalone/Stratum-Observability)
patterns — catalog as single source of truth, typed emit, publisher fan-out
— implemented as a tiny library so you keep full IDE autocomplete and don't
inherit a JS-frontend-flavored framework.

## What you get

- **`defineCatalog(schemas)`** — typed emitter factory. Pass a map of
  `{ eventName: zodSchema }`, get back `emit`, `emitAsync`, `setPublishers`.
- **Publishers** — `consolePublisher`, `memoryPublisher`, `fileSinkPublisher`.
  Bring your own for Sentry / Axiom / PostHog.
- **`createContext<T>()`** — AsyncLocalStorage request-context store, generic
  over your app's context shape (`requestId` plus tenantId/userId/etc.).
- **`captureError` + `setErrorSink`** — separate error pathway from the
  event catalog. Default: stderr JSON. Swap in `@sentry/node` at boot.
- **`createWrappers({ catalog, procedure, job })`** — uniform start/succeed/
  fail emission for tRPC procedures and Inngest jobs. Specify which catalog
  events count as the lifecycle pair; the wrappers handle the timing.
- **`createTestHarness(catalog)`** — `install` / `uninstall` per test;
  `expectSequence` for flow assertions; `assertFullCoverage` backstop.
- **`reportCoverage({...})`** — read a JSONL event log written by
  `fileSinkPublisher`, write a markdown coverage report. Designed for
  vitest globalTeardown.

## Install

```bash
pnpm add @rachelallyson/observability-core
```

`zod` is a peer dependency (^3.24 or ^4).

## Quick start

```ts
import { z } from 'zod'
import {
  defineCatalog,
  consolePublisher,
  createContext,
  createWrappers,
} from '@rachelallyson/observability-core'

// 1. Define your catalog
const baseSchema = z.object({
  requestId: z.string(),
  tenantId: z.string().uuid().optional(),
})

const schemas = {
  'app.started': baseSchema.extend({ environment: z.string(), version: z.string() }),
  'trpc.procedure.started': baseSchema.extend({ procedure: z.string() }),
  'trpc.procedure.succeeded': baseSchema.extend({ durationMs: z.number(), procedure: z.string() }),
  'trpc.procedure.failed': baseSchema.extend({ durationMs: z.number(), errorCode: z.string(), procedure: z.string() }),
  'job.run.started': baseSchema.extend({ jobName: z.string() }),
  'job.run.succeeded': baseSchema.extend({ durationMs: z.number(), jobName: z.string() }),
  'job.run.failed': baseSchema.extend({ durationMs: z.number(), errorMessage: z.string(), jobName: z.string() }),
  // ...your domain events
} as const

export const catalog = defineCatalog(schemas)

// 2. Wire publishers at boot
catalog.setPublishers([consolePublisher()])

// 3. Set up request context
export const ctx = createContext<{ requestId: string; tenantId?: string }>()

// 4. Build typed wrappers
export const { withProcedureEvents, withJobEvents } = createWrappers({
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

// 5. Emit
catalog.emit('app.started', { requestId: 'boot', environment: 'production', version: '1.0.0' })
```

## tRPC integration

```ts
const observabilityMiddleware = t.middleware(async ({ ctx: trpcCtx, next, path, type }) => {
  const procedure = `${type}:${path}`
  const start = Date.now()
  catalog.emit('trpc.procedure.started', { procedure, requestId: trpcCtx.requestId })

  const result = await next()

  if (result.ok) {
    catalog.emit('trpc.procedure.succeeded', {
      procedure, durationMs: Date.now() - start, requestId: trpcCtx.requestId,
    })
  } else {
    catalog.emit('trpc.procedure.failed', {
      procedure, durationMs: Date.now() - start,
      errorCode: result.error.code, requestId: trpcCtx.requestId,
    })
  }
  return result
})

export const publicProcedure = t.procedure.use(observabilityMiddleware)
```

One middleware seam auto-instruments every procedure your app ever defines.

## Inngest integration

The `withJobEvents` wrapper is generic. For Inngest specifically, write a
thin app-side wrapper that pulls `requestId`/`tenantId` out of the event
payload and threads them through `runWithContext`:

```ts
import { withJobEvents } from './observability'
import { ctx } from './observability/context'

export function withInngestJob<TArgs, TResult>(
  jobName: string,
  handler: (args: TArgs) => Promise<TResult>,
) {
  return async (args: TArgs) => {
    const event = (args as { event?: { id?: string; data?: { tenantId?: string } } }).event
    const requestId = event?.id ? `inngest-${event.id}` : `inngest-${jobName}-${Date.now()}`
    return ctx.with({ requestId, tenantId: event?.data?.tenantId }, () =>
      withJobEvents(jobName, handler)(args),
    )
  }
}
```

## Test harness

```ts
import { createTestHarness } from '@rachelallyson/observability-core'
import { catalog } from './observability'

const harness = createTestHarness(catalog)

beforeEach(() => harness.install(expect.getState().currentTestName ?? ''))
afterEach(() => harness.uninstall())

it('emits the expected sequence', async () => {
  await doTheFlow()
  harness.expectSequence(['trpc.procedure.started', 'guest.created', 'trpc.procedure.succeeded'])
})
```

## Coverage backstop

Per-worker setup file installs the JSONL sink:

```ts
// vitest-setup.ts
import { fileSinkPublisher } from '@rachelallyson/observability-core'
import { catalog } from './observability'

catalog.setPublishers([fileSinkPublisher('./obs-coverage/events.jsonl')])
```

vitest globalSetup writes the report on teardown:

```ts
// vitest-global.ts
import { rmSync } from 'node:fs'
import { reportCoverage } from '@rachelallyson/observability-core'
import { schemas } from './observability/schemas'

export async function setup() {
  rmSync('./obs-coverage/events.jsonl', { force: true })
}

export async function teardown() {
  reportCoverage({
    jsonlPath: './obs-coverage/events.jsonl',
    markdownPath: './obs-coverage/coverage.md',
    schemas,
    allowMissing: [],
  })
}
```

Wire both into `vitest.config.ts`:

```ts
test: {
  setupFiles: ['./vitest-setup.ts'],
  globalSetup: ['./vitest-global.ts'],
}
```

## Design notes

- **Publishers swallow their own errors.** A broken transport doesn't kill
  the request. `emitAsync` is the variant that surfaces failures.
- **`captureError` is intentionally separate from `emit()`.** Events
  describe things that happened; errors describe things that went wrong.
  Sentry is the right destination for the latter.
- **Context propagation is opt-in.** `createContext` returns a store; you
  decide where to install it (Next.js middleware, tRPC context factory,
  Inngest handler entry).

## License

MIT
