import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'

/**
 * Minimal OTel SDK init. In a real app, swap in your APM-specific
 * exporter (Honeycomb, Datadog, Tempo) — the Spectra `otelPublisher`
 * just calls `trace.getActiveSpan()`, so any SDK works.
 */
const provider = new NodeTracerProvider()
provider.register()
