# Contributing to Spectra

Thanks for being here. Spectra is small (under 1000 lines of TS) and
designed to stay that way — new features should pull their weight.

## Development setup

```bash
git clone https://github.com/rachelallyson/spectra.git
cd spectra
pnpm install
pnpm test
pnpm typecheck
pnpm typecheck:examples
pnpm lint:package
```

We use the version of pnpm pinned in `packageManager`. Corepack picks
this up automatically; no manual install needed.

## Running tests

```bash
pnpm test           # Once
pnpm test:watch     # Watch mode
```

Tests run in two environments via `vitest.workspace.ts`:

- `node` — every `*.test.ts` runs here.
- `browser` — isomorphic modules (`catalog`, `coverage`, `http-publisher`,
  etc.) run here too, under happy-dom, so DOM-dependent code paths
  (e.g. `sendBeacon` on `visibilitychange`) actually exercise.

## Project layout

```
src/
  catalog.ts             — defineCatalog, validation
  schemas.ts             — withBase, mergeSchemas (Zod-aware helpers)
  publishers.ts          — Publisher type, console, memory
  publishers-node.ts     — fileSinkPublisher (node:fs)
  publisher-utils.ts     — sampledPublisher, redactingPublisher
  http-publisher.ts      — fetch + sendBeacon
  otel-publisher.ts      — span events on the active OTel span
  context.ts             — AsyncLocalStorage-backed request context
  errors.ts              — captureError + setErrorSink
  wrappers.ts            — createWrappers (tRPC/Inngest lifecycle)
  test-harness.ts        — createTestHarness
  coverage.ts            — coveragePublisher + tally helpers (isomorphic)
  coverage-report.ts     — JSONL → markdown (Node only)
docs/                    — VitePress site; published to GitHub Pages
examples/                — runnable sample apps, typechecked in CI
scripts/                 — shell scripts used by CI
```

## What's in scope

- Bug fixes.
- Test coverage gaps.
- Performance improvements that don't add API surface.
- Documentation, recipes, examples.
- *Generic* transport publishers (`httpPublisher`, `otelPublisher`-style)
  that save adopters writing the same 30 lines across multiple vendors.

## What's out of scope

- Vendor SDK code (Sentry, PostHog, Datadog, Axiom). Spectra stays
  vendor-neutral. The [vendors page](./docs/vendors.md) shows
  copy-pasteable templates.
- Frameworks. The whole point is the library is small.
- Replacing OpenTelemetry. Spectra is the typed-events layer above OTel.
- Adding runtime dependencies. Zod is the only required peer.

## Submitting changes

```bash
# 1. Branch and code.
git switch -c your-feature

# 2. Add tests. Every public surface needs at least one test.

# 3. Add a changeset describing user-visible changes.
pnpm changeset

# 4. Verify before pushing.
pnpm typecheck && pnpm test && pnpm lint:package

# 5. PR. CI will re-verify on every commit.
```

A single PR can have multiple changesets if it touches independent
features. Most PRs have one or zero (zero for internal-only changes
like CI tweaks).

## SemVer policy

Pre-1.0 we treat minor as potentially breaking. See
[RELEASING.md](./RELEASING.md) for the full policy and the release
flow.

## Reporting bugs

Open an issue with: Spectra version, Node/browser version, the
catalog snippet that reproduces it, and what you expected vs what
happened.

## Security

For anything sensitive, see [SECURITY.md](./SECURITY.md) — please
report privately rather than open a public issue.
