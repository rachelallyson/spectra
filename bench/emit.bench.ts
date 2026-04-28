import { Bench } from 'tinybench'
import { z } from 'zod'
import { defineCatalog } from '../src/catalog.js'
import { sampledPublisher } from '../src/publisher-utils.js'

/**
 * Per-emit cost across the most common configurations. Run with:
 *   pnpm bench
 *
 * Numbers are very rough — they vary with V8 version, CPU, and load.
 * The point is relative cost (which knobs matter) and a regression
 * backstop (don't make these 10× slower without noticing).
 */

const schemas = {
  'op.completed': z.object({ durationMs: z.number(), id: z.string() }),
}
const noopPublisher = { name: 'noop', publish: () => undefined }
const tenNoopPublishers = Array.from({ length: 10 }, () => ({ ...noopPublisher }))

const strict = defineCatalog(schemas)
strict.setPublishers([noopPublisher])

const off = defineCatalog(schemas, { validate: 'off' })
off.setPublishers([noopPublisher])

const tenPubs = defineCatalog(schemas)
tenPubs.setPublishers(tenNoopPublishers)

const sampledOnePct = defineCatalog(schemas)
sampledOnePct.setPublishers([sampledPublisher(0.01, noopPublisher)])

const noPublishers = defineCatalog(schemas)
noPublishers.setPublishers([])

const payload = { durationMs: 12, id: 'evt' }

const bench = new Bench({ time: 500 })

bench
  .add('emit (validate: strict, 1 publisher)', () => {
    strict.emit('op.completed', payload)
  })
  .add('emit (validate: off, 1 publisher)', () => {
    off.emit('op.completed', payload)
  })
  .add('emit (validate: strict, 10 publishers)', () => {
    tenPubs.emit('op.completed', payload)
  })
  .add('emit (validate: strict, 0 publishers)', () => {
    noPublishers.emit('op.completed', payload)
  })
  .add('emit through sampledPublisher(0.01)', () => {
    sampledOnePct.emit('op.completed', payload)
  })

await bench.run()

const rows = bench.tasks.map((t) => {
  const lat = t.result?.latency
  const ops = lat ? 1000 / lat.mean : 0
  return {
    Task: t.name,
    'ops/sec': ops ? ops.toFixed(0) : '-',
    'mean (µs)': lat ? (lat.mean * 1000).toFixed(3) : '-',
    rme: lat ? `${lat.rme.toFixed(1)}%` : '-',
    samples: t.result?.latency?.samples?.length ?? '-',
  }
})

console.table(rows)
