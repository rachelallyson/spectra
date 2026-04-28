import {
  captureError,
  consolePublisher,
  defineCatalog,
} from '@rachelallyson/spectra'
import { parseEventBatch } from '@rachelallyson/spectra/ingest'
import { fileSinkPublisher } from '@rachelallyson/spectra/publishers/node'
import { z } from 'zod'

/**
 * Browser-event ingestion. Mirrors the schemas the browser uses so the
 * server can re-validate events as defense in depth (a browser can be
 * tampered with), then forward accepted events through a dedicated
 * server-side catalog whose publishers durably log them.
 */

const ClientEventSchemas = {
  'auth.signed_in': z.object({ userId: z.string() }),
  'checkout.completed': z.object({ amount: z.number(), orderId: z.string() }),
  'route.changed': z.object({ from: z.string(), to: z.string() }),
}

const clientCatalog = defineCatalog(ClientEventSchemas)
clientCatalog.setPublishers([
  consolePublisher(),
  fileSinkPublisher('./obs-coverage/client-events.jsonl'),
])

/** Plug into any framework that gives you the parsed JSON body. */
export async function ingestClientEvents(body: unknown): Promise<{ accepted: number; rejected: number }> {
  const { accepted, rejected } = parseEventBatch(ClientEventSchemas, body)

  if (rejected.length > 0) {
    captureError(new Error(`${rejected.length} client events rejected`), {
      rejected: rejected.slice(0, 10),
      route: '/api/events',
    })
  }

  for (const evt of accepted) {
    clientCatalog.emit(evt.name, evt.payload)
  }

  return { accepted: accepted.length, rejected: rejected.length }
}
