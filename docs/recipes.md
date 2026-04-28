# Recipes

Concrete integration patterns. Copy / paste / adapt.

## tRPC — instrument every procedure with one middleware

Create a middleware that emits `started/succeeded/failed` and apply it
to the base of every procedure type. Every procedure your app defines
gets auto-instrumented.

```ts
// src/server/trpc.ts
import { initTRPC, TRPCError } from '@trpc/server'
import { catalog } from '../observability/catalog'

const t = initTRPC.context<AppContext>().create()

const observabilityMiddleware = t.middleware(async ({ ctx, next, path, type }) => {
  const procedure = `${type}:${path}`
  const start = Date.now()

  catalog.emit('trpc.procedure.started', {
    procedure,
    requestId: ctx.requestId,
    tenantId: ctx.tenantId,
  })

  const result = await next()

  if (result.ok) {
    catalog.emit('trpc.procedure.succeeded', {
      procedure,
      durationMs: Date.now() - start,
      requestId: ctx.requestId,
      tenantId: ctx.tenantId,
    })
  } else {
    catalog.emit('trpc.procedure.failed', {
      procedure,
      durationMs: Date.now() - start,
      errorCode: result.error.code,
      requestId: ctx.requestId,
      tenantId: ctx.tenantId,
    })

    if (result.error.code === 'INTERNAL_SERVER_ERROR') {
      captureError(result.error.cause ?? result.error, {
        procedure,
        requestId: ctx.requestId,
      })
    }
  }

  return result
})

// Apply to every procedure type your app uses.
export const publicProcedure = t.procedure.use(observabilityMiddleware)
export const authedProcedure = publicProcedure.use(/* auth check */)
```

Now every router file gets observability for free — no per-procedure
plumbing.

## Inngest — wrap every handler

Inngest functions don't have a middleware seam, so wrap each handler.
Spectra's wrappers don't know about Inngest specifically, so write a
thin app-side helper:

```ts
// src/observability/inngest.ts
import { runWithContext } from './context'
import { captureError, emit } from './catalog'

type InngestArg = { event?: { id?: string; data?: { tenantId?: string } } }

export function withInngestJob<TArgs extends InngestArg, TResult>(
  jobName: string,
  handler: (args: TArgs) => Promise<TResult>,
): (args: TArgs) => Promise<TResult> {
  return async (args) => {
    const tenantId = args.event?.data?.tenantId
    const requestId = args.event?.id ? `inngest-${args.event.id}` : `inngest-${jobName}-${Date.now()}`

    return runWithContext({ requestId, tenantId }, async () => {
      const start = Date.now()

      emit('job.run.started', { jobName, requestId, tenantId })

      try {
        const result = await handler(args)
        emit('job.run.succeeded', { jobName, durationMs: Date.now() - start, requestId, tenantId })
        return result
      } catch (err) {
        emit('job.run.failed', {
          jobName,
          durationMs: Date.now() - start,
          errorMessage: err instanceof Error ? err.message : String(err),
          requestId,
          tenantId,
        })
        captureError(err, { jobName, requestId, tenantId })
        throw err
      }
    })
  }
}
```

Use it:

```ts
export const sendWelcomeEmail = inngest.createFunction(
  { id: 'send-welcome-email' },
  { event: 'user/signed-up' },
  withInngestJob('send-welcome-email', async ({ event, step }) => {
    // ...
  }),
)
```

## Vitest — coverage report

### Per-worker setup file

```ts
// vitest-setup.ts
import { fileSinkPublisher } from '@rachelallyson/spectra/publishers/node'
import { catalog } from './src/observability/catalog'

catalog.setPublishers([fileSinkPublisher('./obs-coverage/events.jsonl')])
```

### Global setup/teardown

```ts
// vitest-global.ts
import { rmSync } from 'node:fs'
import { reportCoverage } from '@rachelallyson/spectra/coverage-report'
import { catalog } from './src/observability/catalog'

export async function setup() {
  rmSync('./obs-coverage/events.jsonl', { force: true })
}

export async function teardown() {
  const report = reportCoverage({
    jsonlPath: './obs-coverage/events.jsonl',
    markdownPath: './obs-coverage/coverage.md',
    schemas: catalog.schemas,
    suiteName: 'my-app',
    allowMissing: [
      // Catalog entries that aren't reachable from the unit/integration
      // suite. Add a justification comment for each.
    ],
  })

  console.error(`Coverage: ${report.hit.length}/${report.total} hit, ${report.missed.length} missed`)
}
```

### Wire into vitest.config.ts

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./vitest-setup.ts'],
    globalSetup: ['./vitest-global.ts'],
  },
})
```

After `pnpm test`, the report lands at `obs-coverage/coverage.md`.
Commit it, or add it to `.gitignore` and let CI generate fresh.

## Vendor adapters

The library doesn't ship vendor adapters. Write your own — usually 10–20
lines.

### Sentry breadcrumbs

```ts
import * as Sentry from '@sentry/node'
import type { Publisher } from '@rachelallyson/spectra'

export function sentryBreadcrumbPublisher<T>(): Publisher<T> {
  return {
    name: 'sentry',
    publish(event) {
      Sentry.addBreadcrumb({
        category: event.name.split('.')[0],
        message: event.name,
        data: event.payload as Record<string, unknown>,
        level: event.name.endsWith('.failed') ? 'error' : 'info',
      })
    },
  }
}
```

### Axiom

```ts
import { Axiom } from '@axiomhq/js'
import type { Publisher } from '@rachelallyson/spectra'

export function axiomPublisher<T>(opts: { token: string; dataset: string }): Publisher<T> {
  const axiom = new Axiom({ token: opts.token })
  return {
    name: 'axiom',
    async publish(event) {
      await axiom.ingest(opts.dataset, [{
        _time: event.timestamp,
        event: event.name,
        ...(event.payload as object),
      }])
    },
  }
}
```

### PostHog

```ts
import { PostHog } from 'posthog-node'
import type { Publisher } from '@rachelallyson/spectra'

export function posthogPublisher<T>(opts: { key: string }): Publisher<T> {
  const ph = new PostHog(opts.key)
  return {
    name: 'posthog',
    // PostHog cares about user-facing events only — filter the noise.
    filter: (event) => event.name.startsWith('user.') || event.name.startsWith('checkin.'),
    publish(event) {
      const payload = event.payload as { userId?: string }
      if (!payload.userId) return
      ph.capture({ distinctId: payload.userId, event: event.name, properties: payload })
    },
  }
}
```

## Error sink — wire Sentry

```ts
// src/observability/init.ts
import * as Sentry from '@sentry/node'
import { setErrorSink } from '@rachelallyson/spectra'

setErrorSink((err, context) => {
  Sentry.captureException(err, { extra: context })
})
```

After this, `captureError(err, { requestId })` automatically routes
through Sentry with the context attached.

## Structural enforcement (instead of an ESLint plugin)

A vitest test that scans the codebase and fails CI if conventions drift.
Faster to maintain than a custom ESLint rule.

```ts
// src/observability/structural.test.ts
import { execSync } from 'node:child_process'
import { describe, it } from 'vitest'

function gitGrep(pattern: string, paths: string[] = []) {
  try {
    return execSync(`git grep -n -E '${pattern}' -- ${paths.join(' ')}`, { encoding: 'utf8' })
  } catch (err) {
    if ((err as { status?: number }).status === 1) return ''
    throw err
  }
}

describe('observability structural rules', () => {
  it('no console.log in production code', () => {
    const hits = gitGrep('console\\.(log|warn|info|debug)\\(', ['src/', ":!src/**/*.test.ts"])
      .split('\n').filter(Boolean)
    if (hits.length) throw new Error(`Stray console.*:\n${hits.join('\n')}`)
  })
})
```
