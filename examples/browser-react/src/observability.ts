import {
  consolePublisher,
  coveragePublisher,
  defineCatalog,
  httpPublisher,
  redactingPublisher,
  tag,
} from '@rachelallyson/spectra'
import { z } from 'zod'

/**
 * One file owns the catalog and the publishers. Everything else
 * imports `catalog` and emits.
 */
export const schemas = {
  'app.boot': z.object({ env: z.string() }),
  'auth.signed_in': tag(z.object({ email: z.string(), userId: z.string() }), {
    pii: 'medium',
  }),
  'checkout.completed': z.object({ amount: z.number(), orderId: z.string() }),
  'checkout.started': z.object({ items: z.number() }),
  'route.changed': z.object({ from: z.string(), to: z.string() }),
}

export const catalog = defineCatalog(schemas)

// Tally hits in memory — we ship the snapshot to the server on
// page-hide so the server can merge it with its own.
export const coverage = coveragePublisher<typeof schemas>()

catalog.setPublishers([
  consolePublisher(),
  coverage,
  // Redact the email field from auth.signed_in before it leaves the browser.
  redactingPublisher(['email'], httpPublisher({
    batch: { maxIntervalMs: 2000, maxSize: 50 },
    url: '/api/events',
  })),
])

// Ship coverage on page-hide. sendBeacon survives the page tearing
// down; a fetch wouldn't.
addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return
  navigator.sendBeacon('/api/coverage', JSON.stringify(coverage.snapshot()))
})
