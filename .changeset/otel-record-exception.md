---
'@rachelallyson/spectra': minor
---

OTel publisher: also call `span.recordException()` on `*.failed`
events (and any predicate you supply).

Linking the exception to the span lets your APM stitch together "this
span errored, here's what." The default predicate matches event names
ending in `.failed` — the convention `createWrappers` produces — but
you can opt in or out with `recordExceptionOn`:

```ts
otelPublisher({
  trace,
  recordExceptionOn: (event) => event.meta?.severity === 'error',
})
```

The exception's message comes from `event.payload.errorMessage` when
present (lifecycle wrappers set this), otherwise the entire payload
is JSON-stringified.

Also: `OtelTraceApi` is now `TraceAPI` from `@opentelemetry/api`
directly, instead of a hand-rolled subset. The previous local
interface had a structural mismatch with OTel's real `Span.addEvent`
signature — the example app caught it on first typecheck.
