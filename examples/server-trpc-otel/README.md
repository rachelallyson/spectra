# Spectra server example (tRPC + OpenTelemetry)

The full server stack:

- One file ([src/observability.ts](./src/observability.ts)) wires the catalog, publishers (console + OTel + JSONL), and the lifecycle wrappers.
- `withBase()` merges shared envelope fields (`requestId`, `tenantId`) into every event.
- `otelPublisher` ships every emit as a span event on the active OTel span — so traces in your APM include the structured event.
- `fileSinkPublisher` writes a JSONL log for vitest globalTeardown to read.
- `withProcedureEvents` wraps tRPC procedures with `started/succeeded/failed`.
- `withJobEvents` wraps background jobs the same way.
- `setErrorSink` routes thrown errors through Sentry (or your forwarder).

## Run it

```bash
cd examples/server-trpc-otel
pnpm install
pnpm start
```

In another terminal:

```bash
curl -s -H 'content-type: application/json' \
  -d '{"json":{"amount":4999,"userId":"u_42"}}' \
  http://localhost:3000/createOrder | jq
```

Watch stderr — every step (request boundary, procedure start/end, the
emitted `order.created`) shows up as structured JSON. The same events
land in `./obs-coverage/events.jsonl` and on the active OTel span.

## What this isn't

A production setup. The example skips:

- Persistent tracing exporter — wire your APM's exporter in
  [src/tracing.ts](./src/tracing.ts) (Honeycomb's `OTLPTraceExporter`,
  Datadog's `dd-trace`, Tempo's HTTP exporter, etc.).
- Real Sentry init — replace the placeholder in `setErrorSink`.
- Auth middleware on the tRPC router. Add yours; the wrappers don't
  care about auth.

The interesting bit is the *integration shape* — one observability
file, structured types end-to-end, lifecycle wrappers that don't add
boilerplate.
