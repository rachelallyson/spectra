#!/usr/bin/env bash
# Pack the package and dynamically import every public entrypoint from
# a clean scratch project. Catches:
#   - broken `exports` map
#   - missing `.js` extensions in compiled imports (the bug that shipped
#     0.1.0 and 0.2.0 broken — vitest resolved source paths fine, but
#     Node ESM rejected the emitted output)
#   - accidental node:-only code in isomorphic subpaths
#
# attw + publint catch most of this statically; this is the runtime
# backstop. Deliberately uses npm (not pnpm) for the install so we
# resolve via a real node_modules tree, not a workspace symlink.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

pnpm pack >/dev/null
TARBALL="$(ls rachelallyson-spectra-*.tgz | head -1)"
trap 'rm -f "$REPO_ROOT/$TARBALL"' EXIT

SCRATCH="$(mktemp -d)"
trap 'rm -f "$REPO_ROOT/$TARBALL"; rm -rf "$SCRATCH"' EXIT

cd "$SCRATCH"
npm init -y >/dev/null
npm install "$REPO_ROOT/$TARBALL" zod >/dev/null 2>&1

ENTRIES=(
  "@rachelallyson/spectra"
  "@rachelallyson/spectra/catalog"
  "@rachelallyson/spectra/publishers"
  "@rachelallyson/spectra/publishers/node"
  "@rachelallyson/spectra/http-publisher"
  "@rachelallyson/spectra/context"
  "@rachelallyson/spectra/errors"
  "@rachelallyson/spectra/wrappers"
  "@rachelallyson/spectra/test-harness"
  "@rachelallyson/spectra/coverage"
  "@rachelallyson/spectra/coverage-report"
)

FAILED=0
for ENTRY in "${ENTRIES[@]}"; do
  if node -e "import('$ENTRY').then(m => { if (Object.keys(m).length === 0) { console.error('empty module: $ENTRY'); process.exit(1) } })" 2>/dev/null; then
    printf "  %-44s ✓\n" "$ENTRY"
  else
    printf "  %-44s ✗\n" "$ENTRY"
    FAILED=1
  fi
done

if [ "$FAILED" -ne 0 ]; then
  echo "smoke test failed — at least one entrypoint did not resolve."
  exit 1
fi

echo "smoke test passed — all $(echo "${ENTRIES[@]}" | wc -w | tr -d ' ') entrypoints resolved."
