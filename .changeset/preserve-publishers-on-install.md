---
'@rachelallyson/spectra': patch
---

Fix: `harness.install()` no longer evicts publishers registered before
it ran. Previously the harness called `catalog.setPublishers([memory,
coverage-tracker])`, replacing any pre-registered sink — most notably a
per-worker `fileSinkPublisher` wired by a vitest setup file. Every event
emitted from any test that touched the harness silently dropped from
that sink for the rest of the worker's lifetime, and the post-suite
coverage report came out missing every test that ran the harness.

Now `install()` snapshots the existing publisher list, prepends it to
the harness's own publishers, and `uninstall()` restores the original
list. Behavior when the catalog had no prior publishers is unchanged.
