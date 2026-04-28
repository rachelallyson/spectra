import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineCatalog } from './catalog.js'
import { otelPublisher, type OtelTraceApi } from './otel-publisher.js'

const schemas = {
  'demo.event': z.object({
    durationMs: z.number(),
    tags: z.array(z.string()),
    user: z.object({ id: z.string() }),
  }),
  'demo.simple': z.object({ id: z.string() }),
}

function makeFakeOtel() {
  const addEvent = vi.fn()
  const span = { addEvent }
  const trace: OtelTraceApi = {
    getActiveSpan: () => span,
  }

  return { addEvent, trace, withoutSpan: { getActiveSpan: () => undefined } as OtelTraceApi }
}

describe('otelPublisher', () => {
  it('adds a span event with prefixed name and flattened attributes', () => {
    const { addEvent, trace } = makeFakeOtel()
    const catalog = defineCatalog(schemas)

    catalog.setPublishers([otelPublisher({ trace })])
    catalog.emit('demo.event', {
      durationMs: 42,
      tags: ['a', 'b'],
      user: { id: 'u1' },
    })

    expect(addEvent).toHaveBeenCalledTimes(1)
    const [name, attrs] = addEvent.mock.calls[0]!

    expect(name).toBe('spectra.demo.event')
    expect(attrs).toEqual({
      durationMs: 42,
      tags: ['a', 'b'],
      'user.id': 'u1',
    })
  })

  it('honors a custom namePrefix and encode', () => {
    const { addEvent, trace } = makeFakeOtel()
    const catalog = defineCatalog(schemas)

    catalog.setPublishers([
      otelPublisher({
        encode: (e) => ({ key: String(e.name) }),
        namePrefix: '',
        trace,
      }),
    ])
    catalog.emit('demo.simple', { id: 'a' })

    expect(addEvent).toHaveBeenCalledWith('demo.simple', { key: 'demo.simple' }, expect.any(Date))
  })

  it('no-ops when there is no active span', () => {
    const { addEvent, withoutSpan } = makeFakeOtel()
    const catalog = defineCatalog(schemas)

    catalog.setPublishers([otelPublisher({ trace: withoutSpan })])
    catalog.emit('demo.simple', { id: 'a' })

    expect(addEvent).not.toHaveBeenCalled()
  })
})
