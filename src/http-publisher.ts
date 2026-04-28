import type { CatalogEvent, SchemaMap } from './catalog.js'
import type { Publisher } from './publishers.js'

/**
 * Ship events (or any serializable payload) to an HTTP endpoint. Isomorphic:
 * uses `fetch` everywhere, optionally `navigator.sendBeacon` on browser
 * unload so in-flight events aren't lost when the page closes.
 *
 * Pair with `coveragePublisher` on the browser to ship snapshots back to
 * a server collector, or use directly to forward raw events.
 */

export interface HttpPublisherOptions {
  /** POST URL. Required. */
  url: string
  /** Override fetch (e.g. test harness, custom auth wrapper). */
  fetch?: typeof globalThis.fetch
  /**
   * Batch settings. If omitted, every event is POSTed immediately.
   * `maxSize` flushes when the buffer hits N events; `maxIntervalMs`
   * flushes on a timer. Either or both.
   */
  batch?: { maxSize?: number; maxIntervalMs?: number }
  /**
   * Use `navigator.sendBeacon` on `visibilitychange === 'hidden'` so
   * pending events ship before the page is torn down. Defaults `true`
   * when `navigator.sendBeacon` exists. Server-side: ignored.
   */
  useBeacon?: boolean
  /** Extra request headers (e.g. auth). */
  headers?: Record<string, string>
  /** Called on transport failure so consumers can route to Sentry, etc. */
  onError?: (err: unknown) => void
}

interface BeaconNavigator {
  sendBeacon(url: string, body: string | Blob): boolean
}

export interface HttpPublisher<TMap extends SchemaMap> extends Publisher<TMap> {
  /** Flush any buffered events immediately. Resolves when the POST completes. */
  flush: () => Promise<void>
}

export function httpPublisher<TMap extends SchemaMap>(
  options: HttpPublisherOptions,
): HttpPublisher<TMap> {
  const fetchImpl = options.fetch ?? globalThis.fetch
  const headers = { 'content-type': 'application/json', ...options.headers }
  const buffer: CatalogEvent<TMap>[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let beaconBound = false

  if (!fetchImpl) {
    throw new Error('[spectra/http-publisher] no `fetch` available — pass `options.fetch`.')
  }

  const post = async (events: CatalogEvent<TMap>[]): Promise<void> => {
    if (events.length === 0) return
    try {
      const res = await fetchImpl(options.url, {
        body: JSON.stringify({ events }),
        headers,
        method: 'POST',
      })

      if (!res.ok) {
        throw new Error(`[spectra/http-publisher] ${res.status} ${res.statusText}`)
      }
    } catch (err) {
      options.onError?.(err)
    }
  }

  const flush = async (): Promise<void> => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (buffer.length === 0) return
    const drain = buffer.splice(0, buffer.length)

    await post(drain)
  }

  const scheduleFlush = (): void => {
    if (timer || !options.batch?.maxIntervalMs) return
    timer = setTimeout(() => {
      timer = null
      void flush()
    }, options.batch.maxIntervalMs)
  }

  const beacon = (): void => {
    if (buffer.length === 0) return
    const nav = (globalThis as unknown as { navigator?: BeaconNavigator }).navigator

    if (!nav?.sendBeacon) {
      void flush()
      return
    }
    const drain = buffer.splice(0, buffer.length)

    try {
      nav.sendBeacon(options.url, JSON.stringify({ events: drain }))
    } catch (err) {
      options.onError?.(err)
    }
  }

  const bindBeacon = (): void => {
    if (beaconBound || options.useBeacon === false) return
    const doc = (globalThis as { document?: { addEventListener: (t: string, h: () => void) => void } })
      .document
    const nav = (globalThis as unknown as { navigator?: BeaconNavigator }).navigator

    if (!doc || !nav?.sendBeacon) return
    doc.addEventListener('visibilitychange', () => {
      const v = (globalThis as { document?: { visibilityState?: string } }).document?.visibilityState
      if (v === 'hidden') beacon()
    })
    beaconBound = true
  }

  return {
    name: `http:${options.url}`,
    publish(event: CatalogEvent<TMap>) {
      bindBeacon()
      if (!options.batch) {
        void post([event])
        return
      }
      buffer.push(event)
      const max = options.batch.maxSize
      if (max && buffer.length >= max) {
        void flush()
      } else {
        scheduleFlush()
      }
    },
    flush,
  }
}
