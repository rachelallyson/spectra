import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineCatalog } from './catalog.js'
import type { Publisher } from './publishers.js'

const schemas = {
  'user.signed_in': z.object({ userId: z.string() }),
  'user.signed_out': z.object({ userId: z.string() }),
}

describe('defineCatalog', () => {
  it('throws with a "did you mean" hint on a near-miss event name', () => {
    const catalog = defineCatalog(schemas)
    expect(() =>
      // @ts-expect-error testing runtime guard for an unknown name
      catalog.emit('user.signed_im', { userId: 'u1' }),
    ).toThrow(/Did you mean "user\.signed_in"/)
  })

  it('throws without a hint when no name is close enough', () => {
    const catalog = defineCatalog(schemas)
    expect(() =>
      // @ts-expect-error
      catalog.emit('totally_unrelated', { userId: 'u1' }),
    ).toThrow(/unknown event "totally_unrelated"\.$/)
  })

  it('isolates publisher failures and routes them to onPublisherError', () => {
    const seen: Array<{ pubName: string; eventName: string }> = []
    const catalog = defineCatalog(schemas, {
      onPublisherError: ({ publisher, event }) => {
        seen.push({ eventName: event.name as string, pubName: publisher.name })
      },
    })
    const flaky: Publisher<typeof schemas> = {
      name: 'flaky',
      publish() {
        throw new Error('boom')
      },
    }
    const calls: string[] = []
    const ok: Publisher<typeof schemas> = {
      name: 'ok',
      publish(event) {
        calls.push(event.name as string)
      },
    }
    catalog.setPublishers([flaky, ok])
    catalog.emit('user.signed_in', { userId: 'u1' })

    expect(calls).toEqual(['user.signed_in'])
    expect(seen).toEqual([{ pubName: 'flaky', eventName: 'user.signed_in' }])
  })

  it('falls back to console.error when no onPublisherError is provided', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const catalog = defineCatalog(schemas)
    catalog.setPublishers([
      {
        name: 'flaky',
        publish() {
          throw new Error('boom')
        },
      },
    ])
    catalog.emit('user.signed_in', { userId: 'u1' })
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('publisher "flaky" failed:'), expect.any(Error))
    spy.mockRestore()
  })
})
