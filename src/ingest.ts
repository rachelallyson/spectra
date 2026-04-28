import type { Output, SchemaMap } from './catalog.js'

/**
 * Parse the JSON body produced by `httpPublisher` against a schema map
 * and return validated events plus structured rejections. Pure: no I/O,
 * no re-emission. Pair with a server-side catalog if you want the
 * accepted events to flow through the existing publisher chain.
 *
 * Designed for the browser → server collector pattern: the browser ships
 * batched events with `httpPublisher`; the server validates them again
 * (defense in depth), durably logs them, and either re-emits them or
 * stops there.
 *
 * Wire format produced by `httpPublisher` is `{ events: CatalogEvent[] }`.
 * After JSON serialization, `event.timestamp` is a string; this helper
 * reconstructs it as a `Date`. `event.meta` is preserved if present.
 *
 * ```ts
 * import { parseEventBatch } from '@rachelallyson/spectra/ingest'
 *
 * export async function POST(request: Request) {
 *   const { accepted, rejected } = parseEventBatch(
 *     clientSchemas,
 *     await request.json().catch(() => null),
 *   )
 *
 *   if (rejected.length > 0) {
 *     captureError(new Error(`${rejected.length} client events rejected`), {
 *       rejected: rejected.slice(0, 10),
 *     })
 *   }
 *
 *   for (const evt of accepted) clientCatalog.emit(evt.name, evt.payload)
 *
 *   return Response.json({ accepted: accepted.length, rejected: rejected.length })
 * }
 * ```
 */

export interface AcceptedEvent<TMap extends SchemaMap, N extends keyof TMap = keyof TMap> {
  name: N
  payload: Output<TMap[N]>
  timestamp: Date
  meta?: Readonly<Record<string, unknown>>
}

export interface RejectedEvent {
  /** Best-effort name; `'<batch>'` for outer-shape failures, `'<unknown>'` for events without a name. */
  name: string
  reason: 'unknown_event' | 'schema_mismatch' | 'malformed' | 'rate_limited'
  /** Raw error from the validator, if applicable. */
  error?: unknown
}

export interface ParseEventBatchOptions {
  /**
   * Hard cap on events per batch. Anything beyond this index is
   * dropped with `reason: 'rate_limited'`. Default: `1000`.
   */
  maxEvents?: number
}

export interface ParseEventBatchResult<TMap extends SchemaMap> {
  accepted: AcceptedEvent<TMap>[]
  rejected: RejectedEvent[]
}

export function parseEventBatch<TMap extends SchemaMap>(
  schemas: TMap,
  body: unknown,
  options: ParseEventBatchOptions = {},
): ParseEventBatchResult<TMap> {
  const maxEvents = options.maxEvents ?? 1000
  const accepted: AcceptedEvent<TMap>[] = []
  const rejected: RejectedEvent[] = []

  if (typeof body !== 'object' || body === null || !('events' in body)) {
    rejected.push({ name: '<batch>', reason: 'malformed' })
    return { accepted, rejected }
  }

  const raw = (body as { events: unknown }).events

  if (!Array.isArray(raw)) {
    rejected.push({ name: '<batch>', reason: 'malformed' })
    return { accepted, rejected }
  }

  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i]

    if (i >= maxEvents) {
      rejected.push({
        name: typeof item === 'object' && item !== null && typeof (item as { name?: unknown }).name === 'string'
          ? (item as { name: string }).name
          : '<unknown>',
        reason: 'rate_limited',
      })
      continue
    }

    if (typeof item !== 'object' || item === null) {
      rejected.push({ name: '<unknown>', reason: 'malformed' })
      continue
    }
    const candidate = item as { name?: unknown; payload?: unknown; timestamp?: unknown; meta?: unknown }

    if (typeof candidate.name !== 'string') {
      rejected.push({ name: '<unknown>', reason: 'malformed' })
      continue
    }
    const name = candidate.name
    const schema = schemas[name]

    if (!schema) {
      rejected.push({ name, reason: 'unknown_event' })
      continue
    }

    let parsed: unknown

    try {
      parsed = schema.parse(candidate.payload)
    } catch (error) {
      rejected.push({ error, name, reason: 'schema_mismatch' })
      continue
    }

    accepted.push({
      meta:
        candidate.meta && typeof candidate.meta === 'object'
          ? (candidate.meta as Readonly<Record<string, unknown>>)
          : undefined,
      name: name as keyof TMap,
      payload: parsed as Output<TMap[keyof TMap]>,
      timestamp: typeof candidate.timestamp === 'string' ? new Date(candidate.timestamp) : new Date(),
    })
  }

  return { accepted, rejected }
}
