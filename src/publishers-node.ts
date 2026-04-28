import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { CatalogEvent, SchemaMap } from './catalog.js'
import type { Publisher } from './publishers.js'

/**
 * Append-only JSON-lines sink. Useful in dev/test to keep a durable record of
 * what got emitted across runs — pair with the memory publisher for in-test
 * assertions and this one for offline inspection.
 *
 * Node-only: imports `node:fs`. Import from `@rachelallyson/spectra/publishers/node`.
 */
export function fileSinkPublisher<TMap extends SchemaMap>(filePath: string): Publisher<TMap> {
  mkdirSync(dirname(filePath), { recursive: true })

  return {
    name: `file-sink:${filePath}`,
    publish(event: CatalogEvent<TMap>) {
      appendFileSync(
        filePath,
        `${JSON.stringify({
          event: event.name,
          t: event.timestamp.toISOString(),
          ...(event.payload as object),
        })}\n`,
      )
    },
  }
}
