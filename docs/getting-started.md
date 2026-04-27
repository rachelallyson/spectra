# Getting Started

This guide takes you from `pnpm add` to your first emitted event in
about ten minutes.

## Install

```bash
pnpm add @rachelallyson/spectra zod
```

`zod` is a peer dependency. Spectra works with Zod 3.24+ or Zod 4.

## 1. Define your catalog

The catalog is the single source of truth for every observable behavior
in your app. Every entry maps a `domain.entity.action` name to a Zod
schema that describes its payload.

```ts
// src/observability/catalog.ts
import { z } from 'zod'
import { defineCatalog } from '@rachelallyson/spectra'

// Every payload extends a base schema with the fields that should travel
// with every event. requestId is the most important — it's how you
// correlate a single user action across logs/traces/events.
const baseSchema = z.object({
  requestId: z.string(),
  tenantId: z.string().uuid().optional(),
})

export const catalog = defineCatalog({
  'app.started': baseSchema.extend({
    environment: z.enum(['development', 'test', 'production']),
    version: z.string(),
  }),

  'user.signed_up': baseSchema.extend({
    userId: z.string().uuid(),
    plan: z.string(),
  }),
})
```

The catalog instance gives you back `emit`, `emitAsync`, `setPublishers`,
plus the type aliases TS needs:

```ts
export type EventName = keyof typeof catalog.schemas
export const { emit, emitAsync, setPublishers } = catalog
```

## 2. Wire publishers at boot

Publishers fan an event out to a transport. Spectra ships three out of
the box; bring your own for Sentry / Axiom / PostHog.

```ts
// src/observability/init.ts
import { consolePublisher } from '@rachelallyson/spectra'
import { catalog } from './catalog'

catalog.setPublishers([
  // Default for development — JSON to stderr.
  consolePublisher(),
  // Add your vendor adapters here.
  // sentryPublisher(),
  // axiomPublisher({ token: process.env.AXIOM_TOKEN! }),
])
```

Call this once at server boot — Next.js' `instrumentation.ts`,
your Express app's startup, your Inngest handler entry, etc.

## 3. Emit

```ts
import { catalog } from './observability/catalog'

catalog.emit('app.started', {
  requestId: 'boot',
  environment: 'production',
  version: '1.0.0',
})
```

TypeScript catches typos in the event name and the payload shape;
Zod validates the payload at runtime. If you pass `'app.startde'` or
forget `version`, both layers reject the call.

## 4. Add request context (optional but recommended)

Every event payload needs `requestId`. Threading it through every
function call is tedious. Use AsyncLocalStorage:

```ts
// src/observability/context.ts
import { createContext } from '@rachelallyson/spectra'

export const ctx = createContext<{ requestId: string; tenantId?: string }>()
```

Set the context once at the edge:

```ts
// Next.js middleware, or your route handler entry
import { ctx } from './observability/context'

ctx.with({ requestId: crypto.randomUUID() }, async () => {
  // Anywhere downstream:
  // const requestId = ctx.currentRequestId()
  await handleRequest()
})
```

Then any code on the same async chain can read it without prop drilling.

## 5. Verify

```bash
pnpm dev
# In another shell:
curl http://localhost:3000/anything
# stderr should show:
# {"event":"app.started","t":"2026-04-27T12:00:00Z","requestId":"...",...}
```

That's it. You have a typed catalog, validated emits, and a console
publisher. Continue to [Concepts](./concepts.md) for the deeper picture
or jump to [Recipes](./recipes.md) for tRPC / Inngest / Vitest setup.
