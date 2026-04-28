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

/** Surface for failures inside publishers. Default is `console.error`. */
export type PublisherErrorHandler<TMap extends SchemaMap> = (info: {
  publisher: Publisher<TMap>
  event: CatalogEvent<TMap>
  error: unknown
}) => void

/**
 * Validation policy for `emit()` / `emitAsync()`.
 *
 * - `'strict'` (default): every emit runs the Zod schema. Callers see a
 *   ZodError on bad payloads — what you want in dev/test/staging.
 * - `'off'`: skip Zod entirely; the payload is forwarded as-is. Use only
 *   in proven hot paths where the upstream caller is already typed and
 *   you've measured the validation cost as actually meaningful.
 * - function: called per emit; return `true` to validate, `false` to skip.
 *   Useful for sampling validation in production (e.g. validate 1 in 100).
 */
export type ValidationMode<TMap extends SchemaMap> =
  | 'strict'
  | 'off'
  | (<N extends keyof TMap>(name: N, payload: unknown) => boolean)

export interface CatalogOptions<TMap extends SchemaMap> {
  /**
   * Called when a publisher's `publish()` throws or rejects. Use this to
   * route to Sentry or your own error pathway. If omitted, errors are
   * logged to `console.error` and other publishers continue.
   */
  onPublisherError?: PublisherErrorHandler<TMap>
  /** See `ValidationMode`. Defaults to `'strict'`. */
  validate?: ValidationMode<TMap>
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

/** Levenshtein distance with an early-exit ceiling. */
function distance(a: string, b: string, ceiling: number): number {
  if (Math.abs(a.length - b.length) > ceiling) return ceiling + 1
  const prev = new Array<number>(b.length + 1)

  for (let j = 0; j <= b.length; j += 1) prev[j] = j
  for (let i = 1; i <= a.length; i += 1) {
    let curr = i
    let rowMin = curr

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const next = Math.min(curr + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost)

      prev[j - 1] = curr
      curr = next
      if (next < rowMin) rowMin = next
    }
    prev[b.length] = curr
    if (rowMin > ceiling) return ceiling + 1
  }

  return prev[b.length] ?? 0
}

function suggestName(name: string, candidates: readonly string[]): string | null {
  const ceiling = Math.max(2, Math.floor(name.length / 3))
  let best: { name: string; d: number } | null = null

  for (const candidate of candidates) {
    const d = distance(name, candidate, ceiling)

    if (d <= ceiling && (!best || d < best.d)) best = { name: candidate, d }
  }

  return best?.name ?? null
}

export function defineCatalog<TMap extends SchemaMap>(
  schemas: TMap,
  options: CatalogOptions<TMap> = {},
): Catalog<TMap> {
  let publishers: Publisher<TMap>[] = []
  const names = Object.keys(schemas)

  const handleError = (
    publisher: Publisher<TMap>,
    event: CatalogEvent<TMap>,
    error: unknown,
  ): void => {
    if (options.onPublisherError) {
      options.onPublisherError({ error, event, publisher })
      return
    }
    console.error(`[spectra] publisher "${publisher.name}" failed:`, error)
  }

  const dispatch = (event: CatalogEvent<TMap>): void => {
    for (const pub of publishers) {
      if (pub.filter && !pub.filter(event)) continue
      try {
        const result = pub.publish(event)

        if (result instanceof Promise) {
          result.catch((err: unknown) => handleError(pub, event, err))
        }
      } catch (err) {
        handleError(pub, event, err)
      }
    }
  }

  const requireSchema = (name: keyof TMap): z.ZodTypeAny => {
    const schema = schemas[name]

    if (schema) return schema
    const suggestion = suggestName(String(name), names)
    const hint = suggestion ? ` Did you mean "${suggestion}"?` : ''

    throw new Error(`[spectra] unknown event "${String(name)}".${hint}`)
  }

  const validateMode = options.validate ?? 'strict'
  const shouldValidate = <N extends keyof TMap>(name: N, payload: unknown): boolean => {
    if (validateMode === 'off') return false
    if (validateMode === 'strict') return true

    return validateMode(name, payload)
  }

  const validate = <N extends keyof TMap>(name: N, payload: unknown): z.infer<TMap[N]> => {
    if (!shouldValidate(name, payload)) {
      // Still resolve the schema so we throw on unknown names; the
      // suggestName hint is the most valuable part of strict-mode parity.
      requireSchema(name)
      return payload as z.infer<TMap[N]>
    }

    return requireSchema(name).parse(payload)
  }

  const emit = <N extends keyof TMap>(name: N, payload: z.infer<TMap[N]>): void => {
    const parsed = validate(name, payload)

    dispatch({ name, payload: parsed, timestamp: new Date() })
  }

  const emitAsync = async <N extends keyof TMap>(
    name: N,
    payload: z.infer<TMap[N]>,
  ): Promise<void> => {
    const parsed = validate(name, payload)
    const event: CatalogEvent<TMap> = {
      name,
      payload: parsed,
      timestamp: new Date(),
    }

    await Promise.all(
      publishers
        .filter((pub) => !pub.filter || pub.filter(event))
        .map(async (pub) => {
          try {
            await pub.publish(event)
          } catch (err) {
            handleError(pub, event, err)
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
    eventNames: names as Array<keyof TMap>,
    getPublishers: () => publishers,
    schemas,
    setPublishers: (next) => {
      publishers = next
    },
  }
}
