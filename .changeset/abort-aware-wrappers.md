---
'@rachelallyson/spectra': minor
---

Wrappers now distinguish AbortSignal cancellations from real failures.

When the wrapped function rejects with an `AbortError`,
`createWrappers` emits the `*.failed` event with `errorKind: 'aborted'`
and *skips* `captureError()` — aborts aren't bugs and shouldn't page
your on-call.

Also exports `isAbortError(err)` for use in your own catch sites.

```ts
import { isAbortError } from '@rachelallyson/spectra'

try {
  await fetch(url, { signal })
} catch (err) {
  if (isAbortError(err)) return  // user navigated away; not an error
  throw err
}
```
