import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineCatalog } from './catalog.js'
import type { Publisher } from './publishers.js'
import { redactingPublisher, sampledPublisher } from './publisher-utils.js'

const schemas = {
  'op.failed': z.object({ message: z.string() }),
  'op.succeeded': z.object({ id: z.string() }),
  'user.signed_in': z.object({
    user: z.object({ email: z.string(), id: z.string() }),
    token: z.string(),
  }),
}

type Map = typeof schemas

describe('sampledPublisher', () => {
  it('rejects out-of-range rates', () => {
    const inner: Publisher<Map> = {
      name: 'inner',
      publish() {},
    }
    expect(() => sampledPublisher(2, inner)).toThrow(/rate must be/)
    expect(() => sampledPublisher(-0.1, inner)).toThrow(/rate must be/)
  })

  it('forwards events stochastically based on the rate', () => {
    const calls: string[] = []
    const inner: Publisher<Map> = {
      name: 'inner',
      publish(e) {
        calls.push(e.name as string)
      },
    }
    const seq = [0.05, 0.5, 0.99]
    let i = 0
    const pub = sampledPublisher(0.1, inner, { random: () => seq[i++] ?? 0 })
    const catalog = defineCatalog(schemas)
    catalog.setPublishers([pub])

    catalog.emit('op.succeeded', { id: '1' })
    catalog.emit('op.succeeded', { id: '2' })
    catalog.emit('op.succeeded', { id: '3' })

    expect(calls).toHaveLength(1) // only the 0.05 < 0.1 emit passed
  })

  it('honors `keep` to bypass sampling for important events', () => {
    const calls: string[] = []
    const inner: Publisher<Map> = {
      name: 'inner',
      publish(e) {
        calls.push(e.name as string)
      },
    }
    const pub = sampledPublisher(0, inner, {
      keep: (e) => String(e.name).endsWith('.failed'),
    })
    const catalog = defineCatalog(schemas)
    catalog.setPublishers([pub])

    catalog.emit('op.succeeded', { id: '1' })
    catalog.emit('op.failed', { message: 'boom' })

    expect(calls).toEqual(['op.failed'])
  })
})

describe('redactingPublisher', () => {
  it('redacts top-level and nested paths without mutating the original payload', () => {
    const captured: Array<{ name: string; payload: unknown }> = []
    const inner: Publisher<Map> = {
      name: 'inner',
      publish(e) {
        captured.push({ name: e.name as string, payload: e.payload })
      },
    }
    const pub = redactingPublisher<Map>(['token', 'user.email'], inner)
    const catalog = defineCatalog(schemas)
    catalog.setPublishers([pub])

    const original = { token: 'sek', user: { email: 'a@b.com', id: 'u1' } }
    catalog.emit('user.signed_in', original)

    expect(captured[0]?.payload).toEqual({
      token: '[REDACTED]',
      user: { email: '[REDACTED]', id: 'u1' },
    })
    // Original object untouched.
    expect(original.token).toBe('sek')
    expect(original.user.email).toBe('a@b.com')
  })

  it('accepts a custom replacement', () => {
    const captured: unknown[] = []
    const inner: Publisher<Map> = {
      name: 'inner',
      publish(e) {
        captured.push(e.payload)
      },
    }
    const pub = redactingPublisher<Map>(['token'], inner, { replacement: null })
    const catalog = defineCatalog(schemas)
    catalog.setPublishers([pub])
    catalog.emit('user.signed_in', { token: 'x', user: { email: 'a', id: 'b' } })

    expect(captured).toEqual([{ token: null, user: { email: 'a', id: 'b' } }])
  })

  it('composes with sampledPublisher (redact outside, sample inside)', () => {
    const seen: unknown[] = []
    const sink: Publisher<Map> = {
      name: 'sink',
      publish(e) {
        seen.push(e.payload)
      },
    }
    const pub = redactingPublisher<Map>(['token'], sampledPublisher(1, sink))
    const catalog = defineCatalog(schemas)
    catalog.setPublishers([pub])

    catalog.emit('user.signed_in', { token: 'x', user: { email: 'a', id: 'b' } })
    expect(seen[0]).toMatchObject({ token: '[REDACTED]' })
  })
})
