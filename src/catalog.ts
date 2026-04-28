import type { z } from 'zod'
import type { Publisher } from './publishers.js'

/**
 * Portable catalog factory. Each app calls defineCatalog with its own map of
 * `{ eventName: zodSchema }` and gets back a fully-typed emitter pair plus the
 * type aliases its codebase needs. No app-specific knowledge lives in core.
 *
 * Stratum-style: the catalog is the single source of truth, the emitter
 * validates against it at runtime, and publishers are the fan-out layer.
 */

export type SchemaMap = Record<string, z.ZodTypeAny>

export interface CatalogEvent<TMap extends SchemaMap, N extends keyof TMap = keyof TMap> {
  name: N
  payload: z.infer<TMap[N]>
  timestamp: Date
}

export interface Catalog<TMap extends SchemaMap> {
  schemas: TMap
  eventNames: ReadonlyArray<keyof TMap>
  emit: <N extends keyof TMap>(name: N, payload: z.infer<TMap[N]>) => void
  emitAsync: <N extends keyof TMap>(name: N, payload: z.infer<TMap[N]>) => Promise<void>
  setPublishers: (next: Publisher<TMap>[]) => void
  getPublishers: () => readonly Publisher<TMap>[]
  /** Test/debug only — clears publishers and snapshots returned to a clean state. */
  __reset: () => void
}

export function defineCatalog<TMap extends SchemaMap>(schemas: TMap): Catalog<TMap> {
  let publishers: Publisher<TMap>[] = []

  const dispatch = (event: CatalogEvent<TMap>): void => {
    for (const pub of publishers) {
      if (pub.filter && !pub.filter(event)) continue
      try {
        const result = pub.publish(event)

        if (result instanceof Promise) {
          result.catch((err) => {
            console.error(`[observability] publisher "${pub.name}" failed:`, err)
          })
        }
      } catch (err) {
        console.error(`[observability] publisher "${pub.name}" threw:`, err)
      }
    }
  }

  const emit = <N extends keyof TMap>(name: N, payload: z.infer<TMap[N]>): void => {
    const schema = schemas[name]

    if (!schema) throw new Error(`[observability] unknown event "${String(name)}"`)
    const parsed = schema.parse(payload)

    dispatch({ name, payload: parsed as z.infer<TMap[N]>, timestamp: new Date() })
  }

  const emitAsync = async <N extends keyof TMap>(
    name: N,
    payload: z.infer<TMap[N]>,
  ): Promise<void> => {
    const schema = schemas[name]

    if (!schema) throw new Error(`[observability] unknown event "${String(name)}"`)
    const parsed = schema.parse(payload)
    const event: CatalogEvent<TMap> = {
      name,
      payload: parsed as z.infer<TMap[N]>,
      timestamp: new Date(),
    }

    await Promise.all(
      publishers
        .filter((pub) => !pub.filter || pub.filter(event))
        .map(async (pub) => {
          try {
            await pub.publish(event)
          } catch (err) {
            console.error(`[observability] publisher "${pub.name}" failed:`, err)
          }
        }),
    )
  }

  return {
    __reset: () => {
      publishers = []
    },
    emit,
    emitAsync,
    eventNames: Object.keys(schemas) as Array<keyof TMap>,
    getPublishers: () => publishers,
    schemas,
    setPublishers: (next) => {
      publishers = next
    },
  }
}
