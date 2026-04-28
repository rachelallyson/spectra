import type { z } from 'zod'
import type { SchemaMap } from './catalog.js'

/**
 * Helpers for composing catalog schema maps. Pure functions over Zod —
 * no runtime knowledge of the catalog itself.
 */

/**
 * Apply a base Zod object to every entry in a schema map. Each entry
 * becomes `base.merge(entry)` — the catalog event ends up with both
 * the base fields and its own.
 *
 * Useful for shared envelope fields (requestId, tenantId, env, etc.)
 * without repeating `base.extend(...)` on every entry.
 *
 * ```ts
 * const base = z.object({ requestId: z.string() })
 * const schemas = withBase(base, {
 *   'app.started': z.object({ env: z.string() }),
 *   'user.signed_in': z.object({ userId: z.string() }),
 * })
 * // → 'app.started' payloads now require both `requestId` and `env`.
 * ```
 *
 * Constraint: every value in `events` must be a `ZodObject` so we can
 * `.merge()`. The compiler enforces this; non-object schemas (unions,
 * arrays at the top level) need to keep their own field copy.
 */
export function withBase<
  TBase extends z.ZodObject<z.ZodRawShape>,
  TEvents extends Record<string, z.ZodObject<z.ZodRawShape>>,
>(
  base: TBase,
  events: TEvents,
): { [K in keyof TEvents]: z.ZodObject<TBase['shape'] & TEvents[K]['shape']> } {
  const out = {} as { [K in keyof TEvents]: z.ZodObject<TBase['shape'] & TEvents[K]['shape']> }

  for (const name of Object.keys(events) as Array<keyof TEvents>) {
    out[name] = base.merge(events[name]) as (typeof out)[typeof name]
  }

  return out
}

/**
 * Combine multiple schema maps into one. Throws on duplicate keys so a
 * silent override can't sneak through. Use to compose feature-module
 * catalogs (`auth.*`, `billing.*`) without flattening them by hand.
 *
 * ```ts
 * const all = mergeSchemas(authSchemas, billingSchemas)
 * const catalog = defineCatalog(all)
 * ```
 */
export function mergeSchemas<T extends SchemaMap[]>(
  ...maps: T
): T extends Array<infer M extends SchemaMap> ? M : never {
  const out: SchemaMap = {}

  for (const map of maps) {
    for (const name of Object.keys(map)) {
      if (Object.hasOwn(out, name)) {
        throw new Error(`[spectra] mergeSchemas: duplicate event name "${name}"`)
      }
      out[name] = map[name]!
    }
  }

  return out as T extends Array<infer M extends SchemaMap> ? M : never
}
