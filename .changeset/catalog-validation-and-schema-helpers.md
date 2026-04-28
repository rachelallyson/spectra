---
'@rachelallyson/spectra': minor
---

Add validation modes and schema-composition helpers.

- `defineCatalog(schemas, { validate })` accepts `'strict'` (default,
  unchanged), `'off'` (skip Zod, forward payload as-is), or a
  `(name, payload) => boolean` predicate for sampled validation in
  production. Unknown event names always throw with a "Did you mean…?"
  hint regardless of mode.
- `withBase(base, events)` (new, isomorphic) merges a base Zod object
  into every entry of a schema map — for shared envelope fields
  (`requestId`, `tenantId`, `env`) without repeating `.extend(...)` on
  each entry.
- `mergeSchemas(...maps)` (new, isomorphic) combines per-domain schema
  maps into one and throws on duplicate keys, so feature modules can
  own their own catalogs without flattening by hand.
- New isomorphic subpath `@rachelallyson/spectra/schemas` (also
  re-exported from the root entry).
