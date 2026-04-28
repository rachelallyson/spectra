import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineCatalog } from './catalog.js'
import { httpPublisher } from './http-publisher.js'
import { parseEventBatch } from './ingest.js'

const schemas = {
  'auth.signed_in': z.object({ userId: z.string() }),
  'checkout.completed': z.object({ amount: z.number(), orderId: z.string() }),
}

describe('parseEventBatch', () => {
  it('accepts events that match the schema', () => {
    const body = {
      events: [
        {
          name: 'auth.signed_in',
          payload: { userId: 'u1' },
          timestamp: '2026-04-28T12:00:00.000Z',
        },
        {
          name: 'checkout.completed',
          payload: { amount: 4999, orderId: 'o1' },
          timestamp: '2026-04-28T12:00:01.000Z',
        },
      ],
    }
    const { accepted, rejected } = parseEventBatch(schemas, body)

    expect(rejected).toEqual([])
    expect(accepted).toHaveLength(2)
    expect(accepted[0]?.name).toBe('auth.signed_in')
    expect(accepted[0]?.payload).toEqual({ userId: 'u1' })
    expect(accepted[0]?.timestamp).toBeInstanceOf(Date)
    expect(accepted[0]?.timestamp.toISOString()).toBe('2026-04-28T12:00:00.000Z')
  })

  it('rejects unknown event names', () => {
    const { accepted, rejected } = parseEventBatch(schemas, {
      events: [{ name: 'made.up', payload: {}, timestamp: '2026-04-28T12:00:00.000Z' }],
    })

    expect(accepted).toEqual([])
    expect(rejected).toEqual([{ name: 'made.up', reason: 'unknown_event' }])
  })

  it('rejects events whose payload fails the schema', () => {
    const { accepted, rejected } = parseEventBatch(schemas, {
      events: [
        { name: 'auth.signed_in', payload: { wrong: true }, timestamp: '2026-04-28T12:00:00.000Z' },
      ],
    })

    expect(accepted).toEqual([])
    expect(rejected[0]?.name).toBe('auth.signed_in')
    expect(rejected[0]?.reason).toBe('schema_mismatch')
    expect(rejected[0]?.error).toBeDefined()
  })

  it('marks malformed bodies and individual malformed entries', () => {
    expect(parseEventBatch(schemas, null).rejected).toEqual([{ name: '<batch>', reason: 'malformed' }])
    expect(parseEventBatch(schemas, { events: 'nope' }).rejected).toEqual([
      { name: '<batch>', reason: 'malformed' },
    ])
    expect(parseEventBatch(schemas, { events: [{ name: 5 }] }).rejected).toEqual([
      { name: '<unknown>', reason: 'malformed' },
    ])
    expect(parseEventBatch(schemas, { events: [null] }).rejected).toEqual([
      { name: '<unknown>', reason: 'malformed' },
    ])
  })

  it('honors maxEvents and tags excess as rate_limited', () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
      name: 'auth.signed_in',
      payload: { userId: `u${i}` },
      timestamp: '2026-04-28T12:00:00.000Z',
    }))
    const { accepted, rejected } = parseEventBatch(schemas, { events }, { maxEvents: 3 })

    expect(accepted).toHaveLength(3)
    expect(rejected).toHaveLength(2)
    expect(rejected.every((r) => r.reason === 'rate_limited')).toBe(true)
  })

  it('uses now() when timestamp is missing or non-string', () => {
    const before = Date.now()
    const { accepted } = parseEventBatch(schemas, {
      events: [{ name: 'auth.signed_in', payload: { userId: 'u1' } }],
    })

    expect(accepted[0]?.timestamp.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('preserves meta when present', () => {
    const { accepted } = parseEventBatch(schemas, {
      events: [
        {
          meta: { pii: 'medium' },
          name: 'auth.signed_in',
          payload: { userId: 'u1' },
          timestamp: '2026-04-28T12:00:00.000Z',
        },
      ],
    })

    expect(accepted[0]?.meta).toEqual({ pii: 'medium' })
  })

  it('round-trips through httpPublisher → parseEventBatch', async () => {
    let capturedBody: unknown = null
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string)
      return { ok: true, status: 200, statusText: 'OK' }
    }) as unknown as typeof fetch

    const catalog = defineCatalog(schemas)
    catalog.setPublishers([httpPublisher({ fetch: fakeFetch, url: 'https://x.example' })])
    catalog.emit('auth.signed_in', { userId: 'u1' })

    // Wait for the async post to drain.
    await new Promise((r) => setTimeout(r, 0))

    const { accepted, rejected } = parseEventBatch(schemas, capturedBody)
    expect(rejected).toEqual([])
    expect(accepted).toHaveLength(1)
    expect(accepted[0]?.name).toBe('auth.signed_in')
  })
})
