import type { Validator } from './catalog.js'

/**
 * Attach event-level metadata to a catalog schema. The catalog reads
 * the tag at emit time and surfaces it on `event.meta`, so publishers
 * can route, redact, or rate-limit by tag without hard-coding.
 *
 * ```ts
 * import { z } from 'zod'
 * import { defineCatalog, tag } from '@rachelallyson/spectra'
 *
 * const catalog = defineCatalog({
 *   'auth.signed_in': tag(z.object({ userId: z.string() }), { pii: 'medium' }),
 *   'billing.charged': tag(z.object({ amount: z.number(), card: z.string() }), {
 *     pii: 'high', retention: 'short',
 *   }),
 * })
 * ```
 *
 * Storage: a module-scoped WeakMap, so tags don't leak into the
 * schema's own shape and don't break Zod's internals.
 */

const META = new WeakMap<object, Readonly<Record<string, unknown>>>()

/**
 * Attach metadata to a schema. Returns the same schema reference so
 * tagging composes inline with other schema construction.
 *
 * Repeated calls merge: `tag(tag(s, { a: 1 }), { b: 2 })` ends up with
 * both `a` and `b` on the same schema. To replace, build a fresh map.
 */
export function tag<V extends Validator>(schema: V, meta: Record<string, unknown>): V {
  if (typeof schema !== 'object' || schema === null) return schema
  const existing = META.get(schema)

  META.set(schema, Object.freeze({ ...existing, ...meta }))

  return schema
}

/**
 * Read metadata back from a schema. Returns `undefined` when nothing
 * was tagged. The returned object is frozen — don't mutate.
 */
export function getMeta(schema: unknown): Readonly<Record<string, unknown>> | undefined {
  if (typeof schema !== 'object' || schema === null) return undefined

  return META.get(schema)
}
