import type { CatalogEvent, SchemaMap } from './catalog.js'
import type { Publisher } from './publishers.js'

/**
 * Composable publisher wrappers — sampling, redaction, etc. Each wrapper
 * is itself a Publisher, so they nest: redact(sample(0.1, axiom)).
 */

/**
 * Wrap a publisher to publish only a sampled fraction of events.
 *
 * - `rate` between 0 and 1 (e.g. 0.1 = 10%).
 * - Optional `keep` predicate forces certain events to bypass sampling
 *   — typical pattern: sample successes, keep all failures.
 *
 * ```ts
 * sampledPublisher(0.1, axiom, {
 *   keep: (e) => e.name.endsWith('.failed'),
 * })
 * ```
 */
export function sampledPublisher<TMap extends SchemaMap>(
  rate: number,
  inner: Publisher<TMap>,
  options: {
    keep?: (event: CatalogEvent<TMap>) => boolean
    random?: () => number
  } = {},
): Publisher<TMap> {
  if (rate < 0 || rate > 1 || Number.isNaN(rate)) {
    throw new Error(`[spectra/sampledPublisher] rate must be in [0, 1], got ${rate}`)
  }
  const random = options.random ?? Math.random

  return {
    name: `sampled(${rate}):${inner.name}`,
    filter: inner.filter,
    publish(event) {
      if (options.keep?.(event)) return inner.publish(event)
      if (random() < rate) return inner.publish(event)
      return undefined
    },
  }
}

/**
 * Wrap a publisher to scrub fields from event payloads before fan-out.
 * Operates on top-level keys by default; pass nested paths as
 * dot-separated strings (`"user.email"`).
 *
 * Replacement value is `'[REDACTED]'` unless overridden.
 *
 * ```ts
 * redactingPublisher(['email', 'token', 'user.ssn'], axiom)
 * ```
 *
 * Mutation: the publisher clones each payload before redacting; the
 * original payload object is not modified.
 */
export function redactingPublisher<TMap extends SchemaMap>(
  paths: string[],
  inner: Publisher<TMap>,
  options: { replacement?: unknown } = {},
): Publisher<TMap> {
  // Don't use ?? — caller may explicitly pass `null` as the replacement
  // (legitimate for sinks that interpret null as "field absent").
  const replacement = 'replacement' in options ? options.replacement : '[REDACTED]'
  const split = paths.map((p) => p.split('.'))

  return {
    name: `redacted:${inner.name}`,
    filter: inner.filter,
    publish(event) {
      const clone: CatalogEvent<TMap> = {
        ...event,
        payload: structuredClone(event.payload) as typeof event.payload,
      }

      for (const segments of split) {
        scrub(clone.payload as Record<string, unknown>, segments, replacement)
      }

      return inner.publish(clone)
    },
  }
}

function scrub(target: Record<string, unknown>, segments: string[], replacement: unknown): void {
  if (segments.length === 0 || target == null || typeof target !== 'object') return
  const [head, ...rest] = segments

  if (!head) return
  if (rest.length === 0) {
    if (Object.hasOwn(target, head)) target[head] = replacement
    return
  }
  const next = target[head]

  if (next != null && typeof next === 'object') {
    scrub(next as Record<string, unknown>, rest, replacement)
  }
}
