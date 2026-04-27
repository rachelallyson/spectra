---
layout: home

hero:
  name: Spectra
  text: Typed observability for TypeScript apps
  tagline: Bring your own catalog. Get typed emit, publisher fan-out, request context, test harness, and a coverage report. ~600 lines, no runtime dependencies.
  image:
    src: /logo.svg
    alt: Spectra
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/rachelallyson/spectra
    - theme: alt
      text: View on npm
      link: https://www.npmjs.com/package/@rachelallyson/spectra

features:
  - icon: 📚
    title: Catalog as the contract
    details: Every observable behavior is a named, Zod-validated entry. Refactors are safe; tests assert against the catalog; coverage flags entries no test exercises.
  - icon: 🔌
    title: Publisher fan-out
    details: Console, memory (tests), and JSONL file sink ship in the box. Bring your own 10-line adapter for Sentry, Axiom, PostHog, or anything else.
  - icon: 🧵
    title: Implicit request context
    details: AsyncLocalStorage store generic over your shape. Set requestId once at the edge, read it from anywhere on the same async chain.
  - icon: 🚨
    title: Errors are not events
    details: captureError + setErrorSink keeps stack traces in Sentry's lane and event noise in the catalog's lane. Different problems, different pathways.
  - icon: 🔁
    title: Lifecycle wrappers
    details: One middleware seam auto-instruments every tRPC procedure. withInngestJob does the same for Inngest. No per-callsite emit() boilerplate.
  - icon: 🧪
    title: Test harness + coverage
    details: expectSequence asserts exact event flows. assertFullCoverage catches catalog drift. Vitest globalTeardown writes obs-coverage.md to surface drift in PR diffs.
---

## Quick example

```ts
import { defineCatalog, consolePublisher } from '@rachelallyson/spectra'
import { z } from 'zod'

const catalog = defineCatalog({
  'app.started': z.object({ env: z.string(), version: z.string() }),
  'guest.created': z.object({ tenantId: z.string(), guestId: z.string() }),
})

catalog.setPublishers([consolePublisher()])

catalog.emit('app.started', { env: 'production', version: '1.0.0' })
//                            ^ TypeScript and Zod both validate this
```

## Why

Most observability is unstructured `console.log` plus whatever Sentry sees. That works until it doesn't — and when it doesn't, you spend an hour grepping logs for the one signal that would have closed the case in seconds.

The [Stratum pattern](https://github.com/capitalone/Stratum-Observability) fixes this by making every observable behavior a named, typed entry in a catalog. The catalog becomes the contract: every emit validates against it, tests assert sequences against it, and a coverage report flags which catalog entries no test ever exercises.

Spectra ships the patterns, not the framework. ~600 lines, no runtime dependencies, full type safety, designed to be read in one sitting.

## What's next

- [Getting Started](/getting-started) — install + first events in 10 minutes.
- [Concepts](/concepts) — the mental model in five short pieces.
- [Recipes](/recipes) — tRPC, Inngest, Vitest setup, vendor adapters.
- [API Reference](/api) — every export with signatures.

## Inspiration

- Capital One's [Stratum-Observability](https://github.com/capitalone/Stratum-Observability) for the catalog + publisher patterns.
- [OpenTelemetry](https://opentelemetry.io/) for the request-context discipline.

Spectra deliberately doesn't try to replace OpenTelemetry — it's the typed-events-and-business-state layer that sits *above* OTel traces and metrics.
