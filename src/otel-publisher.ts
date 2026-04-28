import type { AttributeValue, TraceAPI } from '@opentelemetry/api'
import type { CatalogEvent, SchemaMap } from './catalog.js'
import type { Publisher } from './publishers.js'

/**
 * Bridge catalog events to OpenTelemetry as span events on the active
 * span. Use when your app already has an OTel SDK installed: spans show
 * up in your APM (Honeycomb, Datadog, Tempo) with a structured event
 * for every Spectra emit, no separate vendor publisher needed.
 *
 * The active span is whatever the OTel API's `trace.getActiveSpan()`
 * resolves at emit time. Outside a span (e.g. background work without
 * explicit propagation) the publisher silently skips — span events
 * without a span aren't a thing in OTel.
 *
 * ## Setup
 *
 * The OTel API is an *optional peer*. Install it yourself, then pass
 * the imported `trace` API in:
 *
 * ```ts
 * import { trace } from '@opentelemetry/api'
 * import { otelPublisher } from '@rachelallyson/spectra/otel'
 *
 * catalog.setPublishers([
 *   consolePublisher(),
 *   otelPublisher({ trace }),
 * ])
 * ```
 *
 * Passing the API in (rather than `require()`-ing it) keeps this module
 * isomorphic and bundler-friendly — apps that don't use OTel can still
 * compile and ship without the peer installed.
 */

/**
 * The OTel trace API as exported by `@opentelemetry/api`. We use the
 * peer's own type so the publisher accepts the real `trace` object
 * exactly — no structural-mismatch foot-guns.
 */
export type OtelTraceApi = TraceAPI

export interface OtelPublisherOptions {
  /** The OTel `trace` API. From `@opentelemetry/api`. */
  trace: OtelTraceApi
  /**
   * Prefix prepended to every span event name. Default `'spectra.'`.
   * Set to `''` to use the catalog event name verbatim.
   */
  namePrefix?: string
  /**
   * Maximum depth of nested objects to flatten into span attributes.
   * Span attributes must be primitive (string/number/bool) or arrays
   * of primitives — nested objects need to be flattened with dotted
   * keys (`user.id`). Anything deeper than `maxDepth` levels is
   * JSON-stringified into a single attribute. Default 3.
   */
  maxDepth?: number
  /**
   * Replace the default attribute encoder. Receives the raw payload;
   * returns a flat `Record<string, attr>`. Useful when you want span
   * attributes that don't match the payload shape one-to-one.
   */
  encode?: (event: CatalogEvent<SchemaMap>) => Record<string, AttrValue>
  /**
   * Predicate that decides whether to also call `span.recordException()`
   * for an event. Linking the exception to the span lets your APM
   * stitch together "this span errored, here's what." Default: events
   * whose name ends with `.failed`. Pass `() => false` to disable.
   *
   * The exception comes from `event.payload.errorMessage` if present
   * (the lifecycle wrappers produce this), otherwise the entire
   * payload is JSON-stringified.
   */
  recordExceptionOn?: (event: CatalogEvent<SchemaMap>) => boolean
}

/**
 * A primitive that's safe to attach as an OTel span-attribute value.
 * Mirrors `AttributeValue` from `@opentelemetry/api`.
 */
export type AttrValue = NonNullable<AttributeValue>

export function otelPublisher<TMap extends SchemaMap>(
  options: OtelPublisherOptions,
): Publisher<TMap> {
  const prefix = options.namePrefix ?? 'spectra.'
  const maxDepth = options.maxDepth ?? 3
  const encode = options.encode ?? ((event) => flatten(event.payload, maxDepth))
  const recordExceptionOn =
    options.recordExceptionOn ?? ((event) => String(event.name).endsWith('.failed'))

  return {
    name: 'otel',
    publish(event) {
      const span = options.trace.getActiveSpan()

      if (!span) return
      span.addEvent(
        `${prefix}${String(event.name)}`,
        encode(event as CatalogEvent<SchemaMap>),
        event.timestamp,
      )
      if (recordExceptionOn(event as CatalogEvent<SchemaMap>)) {
        const payload = event.payload as { errorMessage?: unknown } | undefined
        const message = typeof payload?.errorMessage === 'string'
          ? payload.errorMessage
          : JSON.stringify(event.payload)

        span.recordException({ message: message ?? '', name: String(event.name) }, event.timestamp)
      }
    },
  }
}

/**
 * Flatten an object into dotted-key span attributes. Primitives kept
 * as-is; arrays of primitives kept as-is; nested objects recursed up
 * to `depth` levels; anything deeper or non-encodable is
 * JSON-stringified.
 */
function flatten(payload: unknown, depth: number, prefix = ''): Record<string, AttrValue> {
  const out: Record<string, AttrValue> = {}

  if (payload == null || typeof payload !== 'object') {
    if (prefix) out[prefix] = encodeScalar(payload)
    return out
  }

  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key

    if (value == null) {
      out[path] = ''
      continue
    }
    if (Array.isArray(value)) {
      out[path] = encodeArray(value)
      continue
    }
    if (typeof value === 'object' && depth > 0) {
      Object.assign(out, flatten(value, depth - 1, path))
      continue
    }
    out[path] = encodeScalar(value)
  }

  return out
}

function isPrimitive(v: unknown): v is string | number | boolean {
  const t = typeof v

  return t === 'string' || t === 'number' || t === 'boolean'
}

/**
 * OTel only accepts *homogeneous* primitive arrays as span attributes
 * (all-strings, all-numbers, all-booleans). Mixed arrays get
 * JSON-stringified — they'd otherwise blow up the type and still
 * lose information at the wire if we coerced.
 */
function encodeArray(value: unknown[]): AttrValue {
  if (value.length === 0) return [] as string[]
  const first = typeof value[0]

  if (first === 'string' || first === 'number' || first === 'boolean') {
    if (value.every((v) => typeof v === first)) {
      return value as string[] | number[] | boolean[]
    }
  }

  return JSON.stringify(value) ?? 'null'
}

function encodeScalar(v: unknown): AttrValue {
  if (isPrimitive(v)) return v
  if (v instanceof Date) return v.toISOString()
  return JSON.stringify(v) ?? 'null'
}
