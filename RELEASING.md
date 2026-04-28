# Releasing Spectra

Spectra uses [Changesets](https://github.com/changesets/changesets) to
collect what's-changing notes during normal PRs, then bundle them into a
single version-bump PR. Merging that PR auto-publishes to npm.

## One-time setup

The repo needs an `NPM_TOKEN` secret for the publish job:

1. Create a Granular Access Token on npm:
   - https://www.npmjs.com/settings/rachelallyson/tokens → Generate New Token → Granular Access Token
   - **Packages and scopes**: select `@rachelallyson/spectra`
   - **Permissions**: Read and write
   - **Bypass 2FA**: yes (CI can't prompt for OTP)
   - Expiry: pick whatever fits your rotation policy (90 days is reasonable).

2. Add it to the repo:
   ```bash
   gh secret set NPM_TOKEN -R rachelallyson/spectra
   # paste the token when prompted
   ```

## Day-to-day flow

When you make a user-visible change in a PR, add a changeset alongside it:

```bash
pnpm changeset
# → interactive: pick which packages changed, pick patch/minor/major,
#   write a one-line description. Creates .changeset/<random>.md.
git add .changeset && git commit -m "Add changeset"
```

A changeset is *not* required for internal-only changes (CI tweaks,
refactors, doc-only edits). Use SemVer judgment:

- **Patch** — bug fix, doc fix, internal refactor that doesn't touch the public API.
- **Minor** — new export, new option, new publisher. Existing callers don't change.
- **Major** — breaking change. Mention the migration in the changeset body.

Pre-1.0, treat minor bumps as potentially breaking — that's the SemVer
convention for `0.x` releases.

## How it ships

Once your PR with the changeset lands on `main`:

1. The **Release** workflow opens (or updates) a PR titled
   `chore: version packages`. That PR contains the version bump for
   `package.json`, an updated `CHANGELOG.md` section synthesized from
   every pending changeset, and the deletion of those changeset files.
2. Review the PR. If the synthesized CHANGELOG entry needs editing,
   commit on top of the version-bump PR.
3. Merge the PR. The same workflow then runs `pnpm release`, which:
   - typechecks, tests (node + browser projects), and builds,
   - runs `publint` + `attw` (gates broken `exports` maps),
   - runs `changeset publish` → publishes to npm with provenance + creates
     a git tag like `@rachelallyson/spectra@0.3.0`.

Watch the run at https://github.com/rachelallyson/spectra/actions.

## Smoke test after release

```bash
mkdir /tmp/spectra-smoke && cd /tmp/spectra-smoke
pnpm init -y
pnpm add @rachelallyson/spectra@latest zod
node -e "import('@rachelallyson/spectra').then(m => console.log(Object.keys(m)))"
```

Should print the public API.

## Manual release (fallback)

If the release workflow is broken and you need to ship from a laptop:

```bash
git switch main && git pull
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test && pnpm build && pnpm lint:package

# Bump versions and write CHANGELOG locally from any pending changesets:
pnpm changeset version
git add . && git commit -m "chore: version packages"

# Publish (will prompt for npm OTP since you're on a TTY):
pnpm changeset publish

git push origin main --follow-tags
```

## Pre-release versions

For testing big changes without bothering people on `latest`:

```bash
pnpm changeset pre enter beta   # enter pre-release mode
# ... do work, add changesets as usual ...
pnpm changeset version          # → 0.3.0-beta.0
pnpm changeset publish
# When done with the pre-release cycle:
pnpm changeset pre exit
```

Pre-release versions get the npm dist-tag matching the pre-id (e.g.
`beta`), not `latest`.
