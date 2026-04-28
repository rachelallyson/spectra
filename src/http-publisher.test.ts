import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineCatalog } from './catalog.js'
import { httpPublisher } from './http-publisher.js'

const schemas = {
  'user.signed_in': z.object({ userId: z.string() }),
}

describe('httpPublisher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('POSTs each event immediately when no batch is configured', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const catalog = defineCatalog(schemas)
    const pub = httpPublisher<typeof schemas>({ url: 'https://e.x/ingest', fetch: fetchSpy })

    catalog.setPublishers([pub])
    catalog.emit('user.signed_in', { userId: 'u1' })
    catalog.emit('user.signed_in', { userId: 'u2' })

    await Promise.resolve()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    const [, init] = fetchSpy.mock.calls[0]!
    const body = JSON.parse(init.body as string)
    expect(body.events).toHaveLength(1)
    expect(body.events[0].name).toBe('user.signed_in')
  })

  it('batches by size and flushes when the threshold is reached', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const catalog = defineCatalog(schemas)
    const pub = httpPublisher<typeof schemas>({
      batch: { maxSize: 3 },
      fetch: fetchSpy,
      url: 'https://e.x/ingest',
    })

    catalog.setPublishers([pub])
    catalog.emit('user.signed_in', { userId: 'u1' })
    catalog.emit('user.signed_in', { userId: 'u2' })
    expect(fetchSpy).not.toHaveBeenCalled()
    catalog.emit('user.signed_in', { userId: 'u3' })

    await Promise.resolve()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string)
    expect(body.events).toHaveLength(3)
  })

  it('batches by interval', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const catalog = defineCatalog(schemas)
    const pub = httpPublisher<typeof schemas>({
      batch: { maxIntervalMs: 100 },
      fetch: fetchSpy,
      url: 'https://e.x/ingest',
    })

    catalog.setPublishers([pub])
    catalog.emit('user.signed_in', { userId: 'u1' })
    expect(fetchSpy).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('flush() drains the buffer and clears the timer', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const catalog = defineCatalog(schemas)
    const pub = httpPublisher<typeof schemas>({
      batch: { maxIntervalMs: 10000 },
      fetch: fetchSpy,
      url: 'https://e.x/ingest',
    })

    catalog.setPublishers([pub])
    catalog.emit('user.signed_in', { userId: 'u1' })
    await pub.flush()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('routes transport errors to onError', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('network down'))
    const onError = vi.fn()
    const catalog = defineCatalog(schemas)
    const pub = httpPublisher<typeof schemas>({
      fetch: fetchSpy,
      onError,
      url: 'https://e.x/ingest',
    })

    catalog.setPublishers([pub])
    catalog.emit('user.signed_in', { userId: 'u1' })
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce())
    expect(onError).toHaveBeenCalledWith(expect.any(Error))
  })

  it('throws on construction if no fetch is available', () => {
    const original = globalThis.fetch

    // @ts-expect-error simulate environments without fetch
    delete globalThis.fetch
    expect(() => httpPublisher({ url: 'https://e.x/' })).toThrow(/no `fetch` available/)
    globalThis.fetch = original
  })
})
