---
'@rachelallyson/spectra': minor
---

Validator pluggability: schemas no longer have to be Zod.

The catalog now uses a structural `Validator<T>` interface
(`{ parse(input: unknown): T }`) instead of `z.ZodTypeAny`. Zod schemas
satisfy this shape — existing call sites are unaffected — but Valibot,
Effect Schema, and hand-rolled guards work too.

```ts
const catalog = defineCatalog({
  'app.boot': {
    parse(input: unknown): { env: string } {
      // your validation
      return input as { env: string }
    },
  },
})
```

New exported types: `Validator<T>`, `Output<V>` (extracts the parse
return type — stand-in for Zod's `z.infer`).

`@rachelallyson/spectra` no longer carries any `import 'zod'` in its
compiled output. Zod remains a *type-time* peer dep so the d.ts
referenced in user code resolves; required at the type level, optional
at runtime.
