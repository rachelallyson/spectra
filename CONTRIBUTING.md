# Contributing

Thanks for your interest. This is a small, focused library — keep that
in mind when proposing changes.

## Setup

```bash
git clone https://github.com/rachelallyson/spectra.git
cd spectra
pnpm install
pnpm test
```

## What's in scope

- Bug fixes.
- Test coverage gaps.
- Performance improvements that don't add API surface.
- Documentation, recipes, examples.
- Vendor adapter recipes (`docs/recipes.md`) — actual adapter packages
  live elsewhere.

## What's out of scope

- Vendor SDK code in this repo. Spectra stays vendor-neutral. Write a
  one-screen adapter in your app, or publish it as a separate package.
- Frameworks. The whole point is that the library is small. New abstractions
  need a strong "this saves more than it costs" pitch.
- Replacing OpenTelemetry. Spectra is the typed-events layer above OTel.
- Adding runtime dependencies. Zod is the only peer; keep it that way.

## Pull request expectations

- New features: include a test case in `src/*.test.ts`.
- Breaking changes: bump the major version and update CHANGELOG.md
  with a "BREAKING:" entry explaining the migration.
- Public API additions: update `docs/api.md` and at least one of
  `docs/getting-started.md`, `docs/concepts.md`, `docs/recipes.md`.

## Releasing

Maintainer-only. Bump version in `package.json`, update CHANGELOG,
commit, tag with `v<version>`, push tag. The publish workflow handles
the rest.
