# Writing a custom publisher

A publisher is the smallest interface in Spectra:

```ts
interface Publisher<TMap> {
  name: string
  filter?: (event: CatalogEvent<TMap>) => boolean
  publish: (event: CatalogEvent<TMap>) => void | Promise<void>
}
```

Three fields. That's it. If you can write a function that takes one
typed event and forwards it somewhere, you can add a vendor.

## A complete custom publisher in 12 lines

A logger that prints `[event-name] payload` per emit:

```ts
import type { Publisher, SchemaMap } from '@rachelallyson/spectra'

export function prettyLogger<TMap extends SchemaMap>(): Publisher<TMap> {
  return {
    name: 'pretty-logger',
    publish(event) {
      console.log(`[${String(event.name)}]`, event.payload)
    },
  }
}
```

Use it:

```ts
catalog.setPublishers([prettyLogger()])
```

That's the whole shape. Everything else — Sentry, Axiom, PostHog, OTel
— is the same pattern with vendor-specific code in `publish()`.

## Filter to opt in/out per event

`filter` runs before `publish`. Return `false` to skip the event for
this publisher only — others still see it.

```ts
function failuresOnly<TMap extends SchemaMap>(inner: Publisher<TMap>): Publisher<TMap> {
  return {
    name: `failures-only:${inner.name}`,
    filter: (e) => String(e.name).endsWith('.failed'),
    publish: inner.publish,
  }
}
```

Spectra ships ready-made wrappers in this style:
[`sampledPublisher`](/api#publisher-utilities) and
[`redactingPublisher`](/api#publisher-utilities).

## Async publishers

`publish` can return a `Promise`. `emit()` is fire-and-forget — it
doesn't await — but `emitAsync()` does, and any rejection is routed to
the catalog's `onPublisherError` hook (or `console.error` by default).

```ts
function axiomPublisher<TMap extends SchemaMap>(token: string): Publisher<TMap> {
  return {
    name: 'axiom',
    async publish(event) {
      await fetch('https://api.axiom.co/v1/datasets/app/ingest', {
        body: JSON.stringify([{
          _time: event.timestamp.toISOString(),
          name: event.name,
          ...event.payload,
        }]),
        headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' },
        method: 'POST',
      })
    },
  }
}
```

If you're going to write any HTTP-based publisher, consider using the
built-in [`httpPublisher`](/api#http-publisher) — it already handles
batching by size/interval and `sendBeacon` on browser unload.

## Error isolation

If your `publish()` throws or rejects, Spectra catches it: every other
publisher still gets the event, and the failure is routed to the
catalog's `onPublisherError` hook (or `console.error`). You don't need
defensive try/catch inside `publish()` — let it throw.

```ts
const catalog = defineCatalog(schemas, {
  onPublisherError: ({ publisher, event, error }) => {
    Sentry.captureException(error, {
      extra: { event: event.name, publisher: publisher.name },
    })
  },
})
```

## Type safety

Publishers are generic over the schema map. If you accept `Publisher<TMap>`
in your factory, callers get full autocomplete on `event.name` and
`event.payload`:

```ts
function userEventLogger<
  TMap extends SchemaMap & { 'user.signed_in': z.ZodObject<{ userId: z.ZodString }> },
>(): Publisher<TMap> {
  return {
    name: 'user-event-logger',
    filter: (e) => String(e.name).startsWith('user.'),
    publish(e) {
      if (e.name === 'user.signed_in') {
        // e.payload is typed as { userId: string }
        console.log('user signed in:', e.payload.userId)
      }
    },
  }
}
```

## Test it

Use `memoryPublisher` to assert the publisher behaves as you expect:

```ts
import { defineCatalog, memoryPublisher } from '@rachelallyson/spectra'

const catalog = defineCatalog(schemas)
const memory = memoryPublisher<typeof schemas>()
catalog.setPublishers([myCustomPublisher(), memory])

catalog.emit('demo.event', { id: 'a' })
expect(memory.capture()).toHaveLength(1)
```
