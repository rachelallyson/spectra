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

  it("validate: 'off' skips Zod but still rejects unknown event names", () => {
    const catalog = defineCatalog(schemas, { validate: 'off' })
    const seen: unknown[] = []
    catalog.setPublishers([{
      name: 'spy',
      publish: (e) => {
        seen.push(e.payload)
      },
    }])

    // Bad payload accepted (no Zod check) — passed through to publishers as-is.
    catalog.emit('user.signed_in', { totally: 'wrong' } as never)
    expect(seen).toEqual([{ totally: 'wrong' }])

    // Unknown name still throws (with did-you-mean).
    expect(() =>
      // @ts-expect-error
      catalog.emit('user.signed_im', { userId: 'u1' }),
    ).toThrow(/Did you mean/)
  })

  it('validate: function lets you sample validation per event', () => {
    let calls = 0
    const catalog = defineCatalog(schemas, {
      validate: () => {
        calls += 1
        return calls % 2 === 0 // validate every second emit
      },
    })

    expect(() => catalog.emit('user.signed_in', { wrong: 1 } as never)).not.toThrow()
    expect(() => catalog.emit('user.signed_in', { wrong: 1 } as never)).toThrow()
  })

  it('accepts non-Zod validators (structural pluggability)', () => {
    // A hand-rolled validator: anything with .parse(input): T satisfies
    // the Validator<T> interface.
    const customSchemas = {
      'app.boot': {
        parse(input: unknown): { env: string } {
          if (typeof input !== 'object' || input === null || !('env' in input)) {
            throw new Error('boot needs env')
          }
          return input as { env: string }
        },
      },
    }
    const catalog = defineCatalog(customSchemas)
    const seen: Array<{ env: string }> = []
    catalog.setPublishers([
      {
        name: 'spy',
        publish(e) {
          seen.push(e.payload)
        },
      },
    ])

    catalog.emit('app.boot', { env: 'prod' })
    expect(seen).toEqual([{ env: 'prod' }])
    expect(() => catalog.emit('app.boot', { wrong: 1 } as never)).toThrow(/boot needs env/)
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
