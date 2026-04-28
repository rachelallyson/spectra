# Benchmarks

Per-emit cost across the most common configurations. Run:

```bash
pnpm bench
```

## What we measure

- `validate: 'strict'` vs `'off'` — Zod's `parse()` is the single
  biggest cost in a typical emit.
- 0 / 1 / 10 publishers — fan-out overhead.
- `sampledPublisher(0.01)` — what sampling actually saves you when
  the inner publisher is doing real work.

## What we don't claim

- Absolute numbers across machines. V8 version, CPU, and load
  swing these by 2× or more.
- That benchmarks are sufficient. They're a regression backstop, not
  a substitute for measuring your real workload.

## Sample output (M-series MacBook, Node 22)

```
emit (validate: strict, 1 publisher)        ~470k ops/sec   (~2.1µs each)
emit (validate: off, 1 publisher)           ~1.7M ops/sec   (~0.6µs each)
emit (validate: strict, 10 publishers)      ~30k ops/sec    (~30µs each)
emit (validate: strict, 0 publishers)       ~570k ops/sec   (~1.8µs each)
emit through sampledPublisher(0.01)         ~660k ops/sec   (~1.5µs each)
```

## Takeaways

- The default (`validate: 'strict'`) is fast enough for most things —
  ~470k emits/sec means an emit is about as expensive as a
  trivial async function.
- `validate: 'off'` is ~3.5× faster. Worth turning on for genuinely
  hot paths *after* profiling shows it matters; the validation cost
  is almost always dwarfed by something else upstream.
- Per-publisher cost adds up linearly. If you're seeing slowness with
  many publishers, route by metadata or by event-name prefix instead
  of attaching the same publisher to every event.
