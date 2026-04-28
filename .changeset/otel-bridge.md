---
'@rachelallyson/spectra': minor
---

Add an OpenTelemetry bridge: `otelPublisher` ships every catalog event
as a span event on the active span, so traces in your APM (Honeycomb,
Datadog APM, Tempo) include the structured event with flattened
attributes.

`@opentelemetry/api` is declared as an *optional peer*. The publisher
takes the `trace` API as a parameter — apps that don't use OTel
neither install the peer nor import the subpath. New subpath
`@rachelallyson/spectra/otel`.

```ts
import { trace } from '@opentelemetry/api'
import { otelPublisher } from '@rachelallyson/spectra/otel'

catalog.setPublishers([
  consolePublisher(),
  otelPublisher({ trace }),
])
```

Outside an active span the publisher is a silent no-op (span events
without a span aren't a thing in OTel).
