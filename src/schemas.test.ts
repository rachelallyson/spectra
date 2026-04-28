import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineCatalog } from './catalog.js'
import { mergeSchemas, withBase } from './schemas.js'

describe('withBase', () => {
  it('merges base fields into every event schema', () => {
    const base = z.object({ requestId: z.string() })
    const schemas = withBase(base, {
      'app.started': z.object({ env: z.string() }),
      'user.signed_in': z.object({ userId: z.string() }),
    })

    expect(schemas['app.started'].parse({ requestId: 'r1', env: 'prod' })).toEqual({
      env: 'prod',
      requestId: 'r1',
    })
    expect(() => schemas['user.signed_in'].parse({ userId: 'u1' })).toThrow()
  })

  it('integrates with defineCatalog so emit enforces base fields', () => {
    const base = z.object({ requestId: z.string() })
    const catalog = defineCatalog(
      withBase(base, {
        'demo.event': z.object({ id: z.string() }),
      }),
    )

    expect(() => catalog.emit('demo.event', { id: 'a' } as never)).toThrow(/requestId/i)
    expect(() => catalog.emit('demo.event', { id: 'a', requestId: 'r' })).not.toThrow()
  })
})

describe('mergeSchemas', () => {
  it('combines maps without duplicates', () => {
    const auth = { 'auth.signed_in': z.object({ userId: z.string() }) }
    const billing = { 'billing.charged': z.object({ amount: z.number() }) }
    const merged = mergeSchemas(auth, billing)

    expect(Object.keys(merged).sort()).toEqual(['auth.signed_in', 'billing.charged'])
  })

  it('throws on duplicate event name', () => {
    const a = { 'shared.event': z.object({}) }
    const b = { 'shared.event': z.object({}) }

    expect(() => mergeSchemas(a, b)).toThrow(/duplicate event name "shared\.event"/)
  })
})
