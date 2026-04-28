# Vendor publishers

Spectra is vendor-neutral by design. A "vendor adapter" is a 10–30 line
publisher that takes the typed event and calls the vendor's SDK. Drop
as many vendors into one catalog as you want — Spectra fans out to all
of them; one failing vendor doesn't block the others.

These are templates, not packages. Copy into your codebase and adjust.

## Sentry — breadcrumbs + exceptions

Spectra's error pathway (`captureError`) is separate from `emit`. Use
this publisher for the `emit` side only — it adds a breadcrumb per
event so when something blows up later, the breadcrumb trail is in the
exception report.

```ts
import * as Sentry from '@sentry/node'
import type { Publisher, SchemaMap } from '@rachelallyson/spectra'

export function sentryBreadcrumbPublisher<TMap extends SchemaMap>(): Publisher<TMap> {
  return {
    name: 'sentry-breadcrumb',
    publish(event) {
      Sentry.addBreadcrumb({
        category: 'spectra',
        data: event.payload as Record<string, unknown>,
        level: String(event.name).endsWith('.failed') ? 'error' : 'info',
        message: String(event.name),
        timestamp: event.timestamp.getTime() / 1000,
      })
    },
  }
}
```

For the *error* pathway, wire `setErrorSink` to `Sentry.captureException`
once at boot:

```ts
import { setErrorSink } from '@rachelallyson/spectra'
setErrorSink((err, ctx) => Sentry.captureException(err, { extra: ctx }))
```

## PostHog — product analytics

Forward each event as a PostHog `capture()`. Use the `filter` field if
you only want a subset — PostHog gets expensive if you ship every
internal event.

```ts
import { PostHog } from 'posthog-node'
import type { Publisher, SchemaMap } from '@rachelallyson/spectra'

const posthog = new PostHog(process.env.POSTHOG_KEY!, { host: 'https://us.posthog.com' })

export function posthogPublisher<TMap extends SchemaMap>(): Publisher<TMap> {
  return {
    name: 'posthog',
    // Only product-relevant events; skip internal lifecycle noise.
    filter: (e) => /^(user|checkout|feature)\./.test(String(e.name)),
    publish(event) {
      const payload = event.payload as { userId?: string }
      posthog.capture({
        distinctId: payload.userId ?? 'anonymous',
        event: String(event.name),
        properties: payload as Record<string, unknown>,
        timestamp: event.timestamp,
      })
    },
  }
}
```

## Axiom — structured logs

Axiom is a great fit for raw event streams. The
[`httpPublisher`](/api#http-publisher) already does batching and
`sendBeacon` on the browser side, so for Axiom you can use it directly:

```ts
import { httpPublisher } from '@rachelallyson/spectra'

const axiom = httpPublisher({
  batch: { maxIntervalMs: 1000, maxSize: 200 },
  headers: { authorization: `Bearer ${process.env.AXIOM_TOKEN}` },
  url: 'https://api.axiom.co/v1/datasets/app/ingest',
})

catalog.setPublishers([axiom])
```

If you want Axiom's exact ingest envelope (`_time` instead of
`timestamp`, etc.), wrap it:

```ts
function axiomShape<TMap extends SchemaMap>(inner: Publisher<TMap>): Publisher<TMap> {
  return {
    name: `axiom-shape:${inner.name}`,
    publish(event) {
      // Re-shape into Axiom's expected fields.
      return inner.publish({
        ...event,
        payload: {
          _time: event.timestamp.toISOString(),
          name: event.name,
          ...(event.payload as object),
        } as typeof event.payload,
      })
    },
  }
}
```

## Datadog — events API

```ts
import type { Publisher, SchemaMap } from '@rachelallyson/spectra'

export function datadogPublisher<TMap extends SchemaMap>(apiKey: string): Publisher<TMap> {
  return {
    name: 'datadog',
    async publish(event) {
      await fetch('https://api.datadoghq.com/api/v1/events', {
        body: JSON.stringify({
          alert_type: String(event.name).endsWith('.failed') ? 'error' : 'info',
          date_happened: Math.floor(event.timestamp.getTime() / 1000),
          source_type_name: 'spectra',
          tags: [`event:${String(event.name)}`],
          text: JSON.stringify(event.payload),
          title: String(event.name),
        }),
        headers: { 'content-type': 'application/json', 'dd-api-key': apiKey },
        method: 'POST',
      })
    },
  }
}
```

## OpenTelemetry — span events

If your app has an OTel SDK installed, the dedicated bridge ships span
events on the active span — so the trace in your APM (Honeycomb,
Datadog APM, Tempo) shows the structured event.

```ts
import { trace } from '@opentelemetry/api'
import { otelPublisher } from '@rachelallyson/spectra/otel'

catalog.setPublishers([otelPublisher({ trace })])
```

The active span is whatever your tracer has running at emit time;
outside a span the publisher is a no-op. See [OTel publisher](/api#otel-publisher)
for the encoder and prefix options.

## Rate-limit, sample, and redact

The vendor adapters above are `Publisher`s, so any of Spectra's
[publisher utilities](/api#publisher-utilities) compose around them:

```ts
import { redactingPublisher, sampledPublisher } from '@rachelallyson/spectra'

catalog.setPublishers([
  // Sample 5% to PostHog; keep all failures.
  sampledPublisher(0.05, posthogPublisher(), {
    keep: (e) => String(e.name).endsWith('.failed'),
  }),
  // Redact PII before forwarding to Datadog.
  redactingPublisher(['user.email', 'user.ssn'], datadogPublisher(KEY)),
])
```

## Where this leaves you

Two patterns to mix and match:

- **Specific vendor adapters** when the vendor has a non-trivial SDK
  (Sentry breadcrumbs, PostHog `capture`, OTel spans).
- **`httpPublisher` + `redactingPublisher` + `sampledPublisher`** when
  the vendor is "POST JSON to an endpoint with an auth header" (Axiom,
  most webhook-based logging vendors, your own collector).
