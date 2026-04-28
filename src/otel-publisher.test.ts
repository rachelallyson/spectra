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
  'op.failed': z.object({ errorMessage: z.string() }),
}

function makeFakeOtel() {
  const addEvent = vi.fn()
  const recordException = vi.fn()
  // Cast through unknown — we only exercise the methods we need, not the
  // full Span surface.
  const span = { addEvent, recordException } as unknown as ReturnType<OtelTraceApi['getActiveSpan']>
  const trace = {
    getActiveSpan: () => span,
  } as unknown as OtelTraceApi

  return {
    addEvent,
    recordException,
    trace,
    withoutSpan: { getActiveSpan: () => undefined } as unknown as OtelTraceApi,
  }
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

  it('records an exception on *.failed events by default', () => {
    const { addEvent, recordException, trace } = makeFakeOtel()
    const catalog = defineCatalog(schemas)

    catalog.setPublishers([otelPublisher({ trace })])
    catalog.emit('op.failed', { errorMessage: 'boom' })

    expect(addEvent).toHaveBeenCalledOnce()
    expect(recordException).toHaveBeenCalledOnce()
    const [exc] = recordException.mock.calls[0]!
    expect(exc).toMatchObject({ message: 'boom', name: 'op.failed' })
  })

  it('respects a custom recordExceptionOn predicate', () => {
    const { recordException, trace } = makeFakeOtel()
    const catalog = defineCatalog(schemas)

    catalog.setPublishers([otelPublisher({ recordExceptionOn: () => false, trace })])
    catalog.emit('op.failed', { errorMessage: 'boom' })

    expect(recordException).not.toHaveBeenCalled()
  })

  it('no-ops when there is no active span', () => {
    const { addEvent, withoutSpan } = makeFakeOtel()
    const catalog = defineCatalog(schemas)

    catalog.setPublishers([otelPublisher({ trace: withoutSpan })])
    catalog.emit('demo.simple', { id: 'a' })

    expect(addEvent).not.toHaveBeenCalled()
  })
})
