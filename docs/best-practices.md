# What to capture

Spectra gives you a typed catalog and validated emit. It deliberately
doesn't tell you *which* events to define — that's a product decision.
This page is opinion: the baseline catalog every app should have, what
belongs in payloads, what doesn't, and the anti-patterns that erode
signal over time.

If you disagree with any of this — fine. Internal consistency beats
external opinion. Pick a convention and hold the line.

## The mental model: events vs errors vs traces

Three different channels, three different audiences:

- **Events** (`emit`) — *things that happened*. Past-tense. Customer-
  visible state transitions, lifecycle markers, business-meaningful
  outcomes. Read by humans (in product analytics, debugging) and
  machines (in coverage reports, alerts on volume drops).
- **Errors** (`captureError`) — *things that went wrong*. Errors aren't
  events. Routing them to the same sink conflates causes with effects:
  one Sentry exception report can describe a single failure, but
  emitting it as `payment.failed` *and* `captureError(...)` lets the
  failure event drive an analytics signal without polluting your
  exception stream with normal flow.
- **Traces** — *the shape of work*. OpenTelemetry spans cover request
  flow and dependency graph. Spectra emits *into* spans via
  `otelPublisher`, but you should still have spans even without
  Spectra — they answer "where was the time spent."

Rule of thumb: if you can imagine a *non-engineer* reading the event
name and learning something useful, it's an event. If only an
on-call engineer cares, it's probably an error or a span.

## The baseline catalog

Every server-side app should define at least these. Adapt names to
your domain; the *categories* are the point.

```ts
import { z } from 'zod'
import { defineCatalog, withBase } from '@rachelallyson/spectra'

const baseFields = z.object({
  requestId: z.string(),
  tenantId: z.string().optional(),
})

export const catalog = defineCatalog(withBase(baseFields, {
  // Lifecycle of the process itself.
  'app.started': z.object({ env: z.string(), version: z.string() }),
  'app.shutdown': z.object({ reason: z.string(), graceful: z.boolean() }),

  // Procedure lifecycle (createWrappers fills these in).
  'proc.started':   z.object({ procedure: z.string() }),
  'proc.succeeded': z.object({ procedure: z.string(), durationMs: z.number() }),
  'proc.failed':    z.object({
    procedure: z.string(), durationMs: z.number(),
    errorCode: z.string(), errorKind: z.string().optional(),
    errorMessage: z.string().optional(),
  }),

  // Job lifecycle (createWrappers also fills these).
  'job.started':   z.object({ jobName: z.string() }),
  'job.succeeded': z.object({ jobName: z.string(), durationMs: z.number() }),
  'job.failed':    z.object({
    jobName: z.string(), durationMs: z.number(), errorMessage: z.string(),
  }),

  // The domain. This is yours to define — see below.
  'order.created': z.object({ orderId: z.string(), amount: z.number() }),
  'order.canceled': z.object({ orderId: z.string(), reason: z.string() }),
}))
```

That's roughly 9–12 entries before you've defined a single
business-specific event. The lifecycle entries pay for themselves
the first time something stalls in production: you can answer "are
we even processing requests" without grep.

## Browser-side baseline

```ts
export const clientCatalog = defineCatalog({
  // Boot + navigation.
  'app.boot':       z.object({ env: z.string(), buildId: z.string() }),
  'route.changed': z.object({ from: z.string(), to: z.string() }),

  // Auth from the user's perspective (mirror your server events
  // where they overlap, but don't *duplicate* — see below).
  'auth.signed_in':  z.object({ method: z.string() }),
  'auth.signed_out': z.object({ initiated_by: z.enum(['user', 'system']) }),

  // Client-side performance.
  'perf.web_vital': z.object({
    name: z.enum(['LCP', 'FID', 'CLS', 'TTFB', 'INP']),
    value: z.number(),
    rating: z.enum(['good', 'needs-improvement', 'poor']),
  }),

  // Domain interactions worth measuring.
  'checkout.started':   z.object({ items: z.number() }),
  'checkout.completed': z.object({ orderId: z.string() }),
  'checkout.abandoned': z.object({ at_step: z.string() }),
})
```

Note the `auth.*` events appear on both sides. That's fine — they're
different facts. The browser sees "the user clicked the sign-in
button"; the server sees "a session was issued." Both are legitimate
events. Don't try to reconcile them into one.

## Domain events: the actual hard part

Lifecycle events are mechanical. *Domain* events are where you
think. The test:

> If this event were the only thing you logged this week, would you
> still know whether the product was healthy?

Good domain events:

- `order.placed`, `order.shipped`, `order.canceled`, `order.refunded`
- `subscription.created`, `subscription.upgraded`, `subscription.churned`
- `feature_flag.evaluated` (only for flags you care about; not all)
- `email.sent`, `email.bounced`
- `search.executed`, `search.no_results`

Bad domain events (too granular, too internal, or both):

- `validator.run` — internal detail; nothing customer-facing.
- `query.completed` — every DB query? You have logs/traces.
- `cache.hit`, `cache.miss` — interesting in aggregate, not per-event.
  If you want hit-rate, emit `cache.report` on a timer with the rate.
- `user.entered_form_field` — high volume, low signal. If you really
  need form-field interaction data, that's a product analytics tool
  (PostHog, Amplitude), not your structured-events catalog.

The rule: **catalog entries are commitments**. Each one is a contract
your tests, dashboards, and on-call alerts can rely on. If you're
not willing to commit to a name and shape for the next year, it's
probably not catalog material.

## Payload discipline

Every payload should answer three questions: **who**, **what**, **so
what**.

- **Who** — `requestId`, `userId`, `tenantId`. Use `withBase()` to
  fold these in once.
- **What** — the noun the event refers to. `orderId`, `subscriptionId`,
  the canonical identifier for whatever happened.
- **So what** — the field you'd group by in a dashboard. `amount`,
  `plan`, `reason`, `durationMs`.

Don't include:

- **Raw inputs.** `searchQuery: 'how to remove competitor name from
  Google'` is exactly what users assumed they were searching
  privately. Hash it (`searchQueryHash`), summarize it
  (`searchQueryWordCount`), or skip it.
- **Stringified blobs.** `payload: JSON.stringify(req.body)` defeats
  the whole point of typed events. If a field is interesting, give
  it a name and a type; if it's not, don't ship it.
- **Full PII** *unless* you've decided the event class warrants it
  and you've tagged the schema (see below).
- **Anything you can get from the trace.** Don't re-emit
  `dbQueryDuration` if your APM already has the span. Trust the
  trace; emit the *outcome*.

## PII and retention with `tag()`

When a payload legitimately needs PII (auth, billing, support
tooling), tag the schema so publishers can act on policy without
hard-coded paths:

```ts
import { tag, defineCatalog, redactingPublisher } from '@rachelallyson/spectra'

const schemas = {
  'support.contacted': tag(
    z.object({ userId: z.string(), email: z.string(), summary: z.string() }),
    { pii: 'high', retention: 'short' },
  ),
  'order.placed': z.object({ orderId: z.string(), amount: z.number() }),
}

const catalog = defineCatalog(schemas)

catalog.setPublishers([
  // Strip the email before forwarding to PostHog.
  redactingPublisher(['email'], posthog),
  // Datadog stays in your VPC; full payload is OK.
  datadog,
])
```

The `pii` and `retention` keys are conventions, not types. Pick a
small enumeration (`'low' | 'medium' | 'high'` and `'short' | 'standard' | 'audit'`)
and document it once.

## Lifecycle wrappers do most of the work

The biggest mistake when adopting Spectra is hand-rolling
`emit('proc.started')` / `emit('proc.succeeded')` / `try/catch ...
emit('proc.failed')` at every call site. **Don't.** Use
`createWrappers`:

```ts
const { withProcedureEvents, withJobEvents } = createWrappers({
  catalog,
  procedure: { started: 'proc.started', succeeded: 'proc.succeeded', failed: 'proc.failed' },
  job:       { started: 'job.started',  succeeded: 'job.succeeded',  failed: 'job.failed'  },
})

// One wrapper per procedure. The catalog gets uniform signal for free.
export const createOrder = withProcedureEvents('createOrder', async (input) => {
  return await db.orders.insert(input)
})
```

If `withProcedureEvents` doesn't fit your transport (custom RPC, not
tRPC), write a 30-line equivalent in your codebase. The shape is
trivial; the value is uniformity.

## Browser-side discipline

Same rules apply, plus a few:

- **Throttle high-frequency events.** Wrap `httpPublisher` with
  `sampledPublisher` and a `keep` predicate that always passes errors.
- **Always emit on `visibilitychange`.** A flush + `sendBeacon` for
  the coverage tally is non-negotiable; a tab-close otherwise loses
  the session's data.
- **Don't emit per-render.** A React component that emits in
  `useEffect` on every state change is a noise generator. Emit on
  *user-initiated* state transitions, not on framework re-renders.

## Coverage discipline

If you've shipped `assertFullCoverage` in your test suite (which you
should), you'll get a build failure the first time you add a catalog
entry without exercising it. That's the feature — it forces you to
write the test before merging.

When the assertion fires:

- **Add a test that exercises the event.** First answer.
- **Add the event to `allowMissing`.** Only acceptable if the event
  needs production state to fire (a real Stripe webhook, a real
  tenant migration). Document *why* in a comment next to the
  allowlist.
- **Delete the catalog entry.** If you can't write a test and can't
  justify allowing it missing, the entry isn't pulling its weight.

## The anti-patterns

In rough order of how often they sneak in:

1. **`emit('app.boot.foo', ...)` to add a new dimension to an
   existing event.** Don't. Add a payload field instead. Catalog
   entries are *not* hierarchical paths; they're flat names.
2. **Calling `emit` and `captureError` for the same failure.** Pick
   one or the other. The wrappers do this correctly: emit
   `proc.failed`, route the error through `captureError` (skipping
   if it's an `AbortError`).
3. **Emitting per-iteration in a loop.** Emit once with the count.
   `data.imported { rows: 4321, durationMs: 6500 }` beats 4321
   `row.imported` events.
4. **Adding a `metadata: Record<string, unknown>` escape hatch to
   payloads.** That's where typed events go to die. If a field is
   real, give it a name and a Zod type. If it's not, drop it.
5. **Emitting on the boundary instead of where the work happens.**
   `auth.signed_in` should fire when the session is issued, not
   when the response leaves the server — those events have
   different durations, different failure modes, different stakes.
6. **Using `emit` for retry attempts.** Emit `*.failed` on terminal
   failure. If you really want retry visibility, that's a span
   attribute, not an event.

## The 60-second test

Before you commit a new catalog entry, ask:

- Could a non-engineer read the name and have an opinion about whether
  it should be ringing alarms?
- Would I want to chart its volume on a dashboard?
- Is the payload's *meaning* unambiguous to someone who's never seen
  the code?

If "yes" three times: ship it.

If any "no": consider whether it's actually an event, or whether it
belongs in your trace, your structured logs, or your `console.debug`
output instead.
