import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineCatalog } from './catalog.js'
import { createTestHarness } from './test-harness.js'
import { createWrappers } from './wrappers.js'

const schemas = {
  'demo.job.failed': z.object({ durationMs: z.number(), errorMessage: z.string(), jobName: z.string() }),
  'demo.job.started': z.object({ jobName: z.string() }),
  'demo.job.succeeded': z.object({ durationMs: z.number(), jobName: z.string() }),
  'demo.proc.failed': z.object({
    durationMs: z.number(),
    errorCode: z.string(),
    errorKind: z.string().optional(),
    errorMessage: z.string().optional(),
    procedure: z.string(),
  }),
  'demo.proc.started': z.object({ procedure: z.string() }),
  'demo.proc.succeeded': z.object({ durationMs: z.number(), procedure: z.string() }),
  'demo.standalone': z.object({ id: z.string() }),
}

const catalog = defineCatalog(schemas)
const harness = createTestHarness(catalog)
const { withJobEvents, withProcedureEvents } = createWrappers({
  catalog,
  job: { failed: 'demo.job.failed', started: 'demo.job.started', succeeded: 'demo.job.succeeded' },
  procedure: {
    failed: 'demo.proc.failed',
    started: 'demo.proc.started',
    succeeded: 'demo.proc.succeeded',
  },
})

describe('test harness', () => {
  beforeEach(() => harness.install(expect.getState().currentTestName ?? 'unknown'))
  afterEach(() => harness.uninstall())

  it('captures emitted events and matches an exact sequence', () => {
    catalog.emit('demo.standalone', { id: 'a' })
    catalog.emit('demo.standalone', { id: 'b' })
    harness.expectSequence(['demo.standalone', 'demo.standalone'])
  })

  it('throws a readable diff on sequence mismatch', () => {
    catalog.emit('demo.standalone', { id: 'a' })
    expect(() => harness.expectSequence(['demo.proc.started'])).toThrow(/sequence mismatch/)
  })

  it('supports allowGaps for subsequence matching', () => {
    catalog.emit('demo.proc.started', { procedure: 'x' })
    catalog.emit('demo.standalone', { id: 'a' })
    catalog.emit('demo.proc.succeeded', { durationMs: 1, procedure: 'x' })
    harness.expectSequence(['demo.proc.started', 'demo.proc.succeeded'], { allowGaps: true })
  })
})

describe('test harness publisher preservation', () => {
  // Regression: install() used to call setPublishers([memory, coverage-tracker])
  // which evicted any pre-registered sink (e.g. a per-worker
  // fileSinkPublisher wired by a vitest setup file). Every event emitted
  // from any test that touched the harness was silently dropped from the
  // sink for the rest of the worker's lifetime — and the post-suite
  // coverage report came out missing every test that ran the harness.
  it('preserves and restores pre-registered publishers across install/uninstall', () => {
    const baselineEvents: string[] = []
    const baseline = {
      name: 'baseline-sink',
      publish: (event: { name: keyof typeof schemas }) => {
        baselineEvents.push(event.name as string)
      },
    }

    catalog.setPublishers([baseline])

    harness.install('publisher-preservation-test')
    catalog.emit('demo.standalone', { id: 'during-install' })
    expect(baselineEvents).toEqual(['demo.standalone'])
    expect(harness.findFirst('demo.standalone')?.payload).toEqual({ id: 'during-install' })

    harness.uninstall()
    expect(catalog.getPublishers()).toEqual([baseline])

    catalog.emit('demo.standalone', { id: 'after-uninstall' })
    expect(baselineEvents).toEqual(['demo.standalone', 'demo.standalone'])

    catalog.setPublishers([])
  })
})

describe('wrappers', () => {
  beforeEach(() => harness.install(expect.getState().currentTestName ?? 'unknown'))
  afterEach(() => harness.uninstall())

  it('emits started → succeeded for procedure success', async () => {
    const fn = withProcedureEvents('greet', async (name: string) => `hi ${name}`)
    const result = await fn('world')

    expect(result).toBe('hi world')
    harness.expectSequence(['demo.proc.started', 'demo.proc.succeeded'])
  })

  it('emits started → failed and rethrows on procedure failure', async () => {
    const fn = withProcedureEvents('break', async () => {
      throw new TypeError('nope')
    })

    await expect(fn()).rejects.toThrow('nope')
    harness.expectSequence(['demo.proc.started', 'demo.proc.failed'])
  })

  it('wraps inngest jobs symmetrically', async () => {
    const fn = withJobEvents('reset-cache', async () => 'ok')

    await fn()
    harness.expectSequence(['demo.job.started', 'demo.job.succeeded'])
  })
})

describe('catalog coverage', () => {
  beforeEach(() => harness.install(expect.getState().currentTestName ?? 'unknown'))
  afterEach(() => harness.uninstall())

  it('passes when allowMissing covers the gaps', () => {
    catalog.emit('demo.standalone', { id: 'only-this' })
    harness.uninstall()
    harness.assertFullCoverage([
      'demo.job.failed',
      'demo.job.started',
      'demo.job.succeeded',
      'demo.proc.failed',
      'demo.proc.started',
      'demo.proc.succeeded',
    ])
  })
})
