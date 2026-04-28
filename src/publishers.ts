import type { CatalogEvent, SchemaMap } from './catalog.js'

/**
 * A publisher fans an event out to a single backend — Axiom, Sentry breadcrumbs,
 * PostHog, a console stream, a test spy, a JSON file. Publishers are dumb: decide
 * whether they care via `filter`, then forward via `publish`.
 *
 * Generic over the schema map so test harnesses can keep full type safety on
 * `event.name` and `event.payload` without casting.
 */
export interface Publisher<TMap extends SchemaMap = SchemaMap> {
  name: string
  filter?: (event: CatalogEvent<TMap>) => boolean
  publish: (event: CatalogEvent<TMap>) => Promise<void> | void
}

/** Structured JSON to stderr. Default for development. */
export function consolePublisher<TMap extends SchemaMap>(): Publisher<TMap> {
  return {
    name: 'console',
    publish(event) {
      console.error(
        JSON.stringify({
          event: event.name,
          t: event.timestamp.toISOString(),
          ...(event.payload as object),
        }),
      )
    },
  }
}

/** In-memory buffer used by tests. Returned alongside the publisher itself. */
export function memoryPublisher<TMap extends SchemaMap>(): Publisher<TMap> & {
  capture: () => CatalogEvent<TMap>[]
  clear: () => void
} {
  const buffer: CatalogEvent<TMap>[] = []

  return {
    capture: () => buffer,
    clear: () => {
      buffer.length = 0
    },
    name: 'memory',
    publish(event) {
      buffer.push(event)
    },
  }
}
