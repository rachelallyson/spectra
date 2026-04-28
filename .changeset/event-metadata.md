---
'@rachelallyson/spectra': minor
---

Event-level metadata: `tag()`, `getMeta()`, `event.meta`,
`routeByMeta()`.

Mark catalog schemas with arbitrary metadata (PII level, retention
class, fan-out destination) and let publishers route on it instead of
hard-coding paths or predicates.

```ts
import { defineCatalog, tag, routeByMeta } from '@rachelallyson/spectra'

const catalog = defineCatalog({
  'auth.signed_in': tag(z.object({ userId: z.string() }), { pii: 'medium' }),
  'billing.charged': tag(z.object({ ... }), { pii: 'high', retention: 'short' }),
})

catalog.setPublishers([
  routeByMeta((m) => m?.pii !== 'high', posthog),  // skip high-PII to PostHog
  datadog,                                          // everything to Datadog (in VPC)
])
```

Storage is a module-scoped `WeakMap`, so tagging doesn't mutate the
schema or break Zod's internals. `event.meta` is populated at emit
time and is `Readonly` (frozen). New isomorphic subpath
`@rachelallyson/spectra/metadata`.
