/**
 * Minimal Spectra example. Run with:
 *
 *   cd examples/basic && pnpm tsx index.ts
 *
 * Demonstrates:
 *   - defineCatalog with a few events
 *   - consolePublisher wired at boot
 *   - request-scoped context propagation
 *   - lifecycle wrapper around a fake "job"
 *   - error pathway
 */
import { z } from 'zod'
import {
  captureError,
  consolePublisher,
  createContext,
  createWrappers,
  defineCatalog,
} from '@rachelallyson/spectra'

// ── 1. Catalog ────────────────────────────────────────────────────────
const baseSchema = z.object({
  requestId: z.string(),
  tenantId: z.string().optional(),
})

const catalog = defineCatalog({
  'app.started': baseSchema.extend({ env: z.string() }),
  'job.run.started': baseSchema.extend({ jobName: z.string() }),
  'job.run.succeeded': baseSchema.extend({ jobName: z.string(), durationMs: z.number() }),
  'job.run.failed': baseSchema.extend({
    jobName: z.string(),
    durationMs: z.number(),
    errorMessage: z.string(),
  }),
  'user.signed_up': baseSchema.extend({ userId: z.string(), plan: z.string() }),
})

// ── 2. Publishers ─────────────────────────────────────────────────────
catalog.setPublishers([consolePublisher()])

// ── 3. Request context ────────────────────────────────────────────────
const ctx = createContext<{ requestId: string; tenantId?: string }>()

// ── 4. Lifecycle wrappers ─────────────────────────────────────────────
const { withJobEvents } = createWrappers({
  catalog,
  job: { started: 'job.run.started', succeeded: 'job.run.succeeded', failed: 'job.run.failed' },
  procedure: { started: 'job.run.started', succeeded: 'job.run.succeeded', failed: 'job.run.failed' },
})

// ── 5. App code ───────────────────────────────────────────────────────
const sendWelcomeEmail = withJobEvents('send-welcome-email', async (userId: string) => {
  // ...do work...
  await new Promise((r) => setTimeout(r, 50))
  catalog.emit('user.signed_up', {
    requestId: ctx.currentRequestId() ?? 'unknown',
    tenantId: ctx.current()?.tenantId,
    userId,
    plan: 'free',
  })
})

async function main() {
  catalog.emit('app.started', { requestId: 'boot', env: 'development' })

  // Set request context for one logical operation
  await ctx.with({ requestId: crypto.randomUUID(), tenantId: 'acme-co' }, async () => {
    try {
      await sendWelcomeEmail('user_123')
    } catch (err) {
      captureError(err, { requestId: ctx.currentRequestId() })
    }
  })
}

main().catch((err) => {
  captureError(err)
  process.exit(1)
})
