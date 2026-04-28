import { trace } from '@opentelemetry/api'
import {
  consolePublisher,
  createWrappers,
  defineCatalog,
  setErrorSink,
  withBase,
} from '@rachelallyson/spectra'
import { fileSinkPublisher } from '@rachelallyson/spectra/publishers/node'
import { otelPublisher } from '@rachelallyson/spectra/otel'
import { z } from 'zod'

/** Shared envelope. Every catalog entry will include these fields. */
const baseFields = z.object({
  requestId: z.string(),
  tenantId: z.string().optional(),
})

/** Catalog. `withBase` merges the envelope into every event. */
export const schemas = withBase(baseFields, {
  'app.boot': z.object({ env: z.string() }),

  // tRPC procedure lifecycle
  'proc.started': z.object({ procedure: z.string() }),
  'proc.succeeded': z.object({ durationMs: z.number(), procedure: z.string() }),
  'proc.failed': z.object({
    durationMs: z.number(),
    errorCode: z.string(),
    errorKind: z.string().optional(),
    errorMessage: z.string().optional(),
    procedure: z.string(),
  }),

  // Inngest job lifecycle
  'job.started': z.object({ jobName: z.string() }),
  'job.succeeded': z.object({ durationMs: z.number(), jobName: z.string() }),
  'job.failed': z.object({
    durationMs: z.number(),
    errorMessage: z.string(),
    jobName: z.string(),
  }),

  // Domain events
  'order.created': z.object({ amount: z.number(), orderId: z.string() }),
  'email.queued': z.object({ template: z.string(), to: z.string() }),
})

export const catalog = defineCatalog(schemas, {
  // Route publisher failures to your error pathway. Sentry, Datadog,
  // whatever — keep it consistent with your captureError sink below.
  onPublisherError: ({ publisher, error }) => {
    console.error(`[obs] publisher ${publisher.name} failed:`, error)
  },
})

catalog.setPublishers([
  consolePublisher(),
  // Span events on the active OTel span — your APM (Honeycomb,
  // Datadog APM, Tempo) shows the trace with each Spectra emit.
  otelPublisher({ trace }),
  // Durable JSONL log; vitest globalTeardown reads this and writes a
  // coverage report so PR diffs surface drift.
  fileSinkPublisher('./obs-coverage/events.jsonl'),
])

// Error pathway. Same Sentry, separate channel from emit().
setErrorSink((err, ctx) => {
  // In a real app: Sentry.captureException(err, { extra: ctx })
  console.error('[err]', err, ctx)
})

/** Lifecycle wrappers — drop-in for tRPC and Inngest. */
export const { withProcedureEvents, withJobEvents } = createWrappers({
  catalog,
  job: { failed: 'job.failed', started: 'job.started', succeeded: 'job.succeeded' },
  procedure: {
    failed: 'proc.failed',
    started: 'proc.started',
    succeeded: 'proc.succeeded',
  },
})
