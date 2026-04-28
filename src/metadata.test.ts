import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineCatalog } from './catalog.js'
import { getMeta, tag } from './metadata.js'
import { routeByMeta } from './publisher-utils.js'

describe('tag / getMeta', () => {
  it('attaches and reads back metadata without mutating the schema', () => {
    const schema = z.object({ id: z.string() })
    const tagged = tag(schema, { pii: 'medium', retention: 'short' })

    expect(tagged).toBe(schema) // same reference
    expect(getMeta(tagged)).toEqual({ pii: 'medium', retention: 'short' })
  })

  it('merges metadata across repeated tag() calls', () => {
    const schema = z.object({ id: z.string() })

    tag(schema, { pii: 'low' })
    tag(schema, { retention: 'long' })

    expect(getMeta(schema)).toEqual({ pii: 'low', retention: 'long' })
  })

  it('returns undefined for un-tagged schemas', () => {
    expect(getMeta(z.object({ id: z.string() }))).toBeUndefined()
    expect(getMeta(null)).toBeUndefined()
    expect(getMeta('not a schema')).toBeUndefined()
  })

  it('frozen result — caller cannot mutate', () => {
    const schema = z.object({ id: z.string() })

    tag(schema, { pii: 'low' })
    const meta = getMeta(schema)

    expect(() => {
      ;(meta as Record<string, unknown>).pii = 'high'
    }).toThrow()
  })
})

describe('CatalogEvent.meta from tagged schemas', () => {
  it('emit() surfaces tagged metadata on the event', () => {
    const schemas = {
      'auth.signed_in': tag(z.object({ userId: z.string() }), { pii: 'medium' }),
      'app.boot': z.object({ env: z.string() }),
    }
    const catalog = defineCatalog(schemas)
    const events: Array<{ name: string; meta?: Readonly<Record<string, unknown>> }> = []

    catalog.setPublishers([
      {
        name: 'spy',
        publish(e) {
          events.push({ meta: e.meta, name: e.name as string })
        },
      },
    ])
    catalog.emit('auth.signed_in', { userId: 'u1' })
    catalog.emit('app.boot', { env: 'prod' })

    expect(events).toEqual([
      { meta: { pii: 'medium' }, name: 'auth.signed_in' },
      { meta: undefined, name: 'app.boot' },
    ])
  })
})

describe('routeByMeta', () => {
  it('skips events whose metadata does not match', () => {
    const schemas = {
      'a': tag(z.object({}), { pii: 'high' }),
      'b': z.object({}),
    }
    const catalog = defineCatalog(schemas)
    const captured: string[] = []

    catalog.setPublishers([
      routeByMeta((meta) => meta?.pii !== 'high', {
        name: 'sink',
        publish(e) {
          captured.push(e.name as string)
        },
      }),
    ])

    catalog.emit('a', {})
    catalog.emit('b', {})

    expect(captured).toEqual(['b'])
  })
})
