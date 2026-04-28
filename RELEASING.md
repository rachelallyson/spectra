# Releasing Spectra

This is the runbook for shipping a new version. Two flavours: automated (recommended) and manual (fallback).

## One-time setup

Before the first automated release, the repo needs an `NPM_TOKEN` secret.

1. Create a Granular Access Token on npm:
   - https://www.npmjs.com/settings/rachelallyson/tokens → Generate New Token → Granular Access Token
   - **Packages and scopes**: select `@rachelallyson/spectra`
   - **Permissions**: Read and write
   - **Bypass 2FA**: yes (CI can't prompt for OTP)
   - Expiry: pick whatever fits your rotation policy (90 days is reasonable)

2. Add it to the GitHub repo:
   ```bash
   gh secret set NPM_TOKEN -R rachelallyson/spectra
   # paste the token when prompted
   ```

## Automated release (preferred)

```bash
# 1. Land all the changes you want in the release on main, with a clean tree.
git switch main && git pull

# 2. Bump the version. `pnpm version` updates package.json and creates a tag.
pnpm version patch    # or: minor, major
#  → bumps to e.g. 0.1.1, commits "0.1.1", and creates tag v0.1.1

# 3. Update CHANGELOG.md with the new section. Commit it on top of the
#    version bump (or amend the version commit if you prefer one commit).
$EDITOR CHANGELOG.md
git add CHANGELOG.md && git commit --amend --no-edit

# 4. Push commit + tag.
git push origin main
git push origin v0.1.1

# That kicks off .github/workflows/publish.yml which:
#   1. Installs deps with frozen lockfile
#   2. Runs typecheck + test + build
#   3. Publishes to npm with provenance
#   4. Creates a GitHub Release with auto-generated notes
```

Watch the run at https://github.com/rachelallyson/spectra/actions. If it fails before publish, no harm done — fix the issue, force-update the tag (`git tag -f v0.1.1 && git push -f origin v0.1.1`), and re-run.

If it fails *after* publish (e.g. the GitHub Release step fails), the package is on npm but the release page isn't created. Run `gh release create v0.1.1 --generate-notes` manually.

## Manual release (fallback)

When the workflow is broken or you need to ship from a laptop:

```bash
cd ~/Repos/spectra
git switch main && git pull
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test && pnpm build

# Bump + tag locally.
pnpm version patch

# You'll be prompted for an npm OTP since you're publishing from a TTY.
pnpm publish --access public --provenance

# Push the version commit and tag.
git push origin main && git push origin --tags

# Create the GitHub Release.
gh release create v$(node -p "require('./package.json').version") --generate-notes
```

## Versioning policy

Spectra follows [SemVer](https://semver.org).

- **Patch** (0.1.0 → 0.1.1) — bug fix, doc-only change, internal refactor that doesn't touch the public API.
- **Minor** (0.1.0 → 0.2.0) — new exports, new options, new publishers. Existing callers don't change.
- **Major** (0.1.0 → 1.0.0) — anything that breaks an existing call site, including renamed/removed exports, changed signatures, or stricter Zod schemas. Update CHANGELOG.md with a `BREAKING:` section explaining the migration.

Pre-1.0, treat minor bumps as potentially breaking — that's the SemVer convention for `0.x` releases.

## Pre-release versions

For testing big changes without bothering people on `latest`:

```bash
pnpm version preminor --preid=beta    # → 0.2.0-beta.0
git push origin main --follow-tags
```

The publish workflow tags pre-release versions on npm with `--tag next` (you'd need to add a step to detect this; see [npm-version docs](https://docs.npmjs.com/cli/v10/commands/npm-version) and [npm-publish#tag](https://docs.npmjs.com/cli/v10/commands/npm-publish#tag) — open an issue if you actually need it).

## What goes in CHANGELOG.md

For each release add a section like:

```md
## [0.1.1] - 2026-05-02

### Added
- New `redactingPublisher()` helper for scrubbing PII before fan-out.

### Fixed
- `harness.install()` now preserves prior publishers (was clobbering the file sink).

### Changed
- `reportCoverage` now writes the report atomically.
```

If the release breaks something, add a `### BREAKING` section with the migration path.

## Smoke-test after release

```bash
# In a scratch directory:
mkdir /tmp/spectra-smoke && cd /tmp/spectra-smoke
pnpm init -y
pnpm add @rachelallyson/spectra@latest zod
node -e "import('@rachelallyson/spectra').then(m => console.log(Object.keys(m)))"
```

Should print the public API. If anything's missing, the publish lost some exports — investigate.
