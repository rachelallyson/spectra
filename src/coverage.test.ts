import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineCatalog } from './catalog.js'
import {
  coveragePublisher,
  formatCoverageSummary,
  mergeCoverage,
  summarizeCoverage,
} from './coverage.js'

const schemas = {
  'checkout.completed': z.object({ orderId: z.string() }),
  'checkout.started': z.object({}),
  'user.signed_in': z.object({ userId: z.string() }),
}

describe('coveragePublisher', () => {
  it('tallies hits per event name and exposes a snapshot', () => {
    const catalog = defineCatalog(schemas)
    const cov = coveragePublisher<typeof schemas>()

    catalog.setPublishers([cov])
    catalog.emit('user.signed_in', { userId: 'u1' })
    catalog.emit('user.signed_in', { userId: 'u2' })
    catalog.emit('checkout.started', {})

    expect(cov.snapshot()).toEqual({
      'checkout.started': 1,
      'user.signed_in': 2,
    })

    cov.reset()
    expect(cov.snapshot()).toEqual({})
  })
})

describe('mergeCoverage', () => {
  it('sums counts across snapshots', () => {
    const merged = mergeCoverage([
      { 'a': 1, 'b': 2 },
      { 'b': 3, 'c': 4 },
    ])
    expect(merged).toEqual({ a: 1, b: 5, c: 4 })
  })

  it('returns an empty snapshot for no inputs', () => {
    expect(mergeCoverage([])).toEqual({})
  })
})

describe('summarizeCoverage', () => {
  const names = Object.keys(schemas)

  it('classifies hits and misses against the catalog', () => {
    const report = summarizeCoverage({ 'user.signed_in': 3 }, names)

    expect(report.total).toBe(3)
    expect(report.hit).toEqual([{ name: 'user.signed_in', count: 3 }])
    expect(report.missed).toEqual(['checkout.completed', 'checkout.started'])
  })

  it('honors allowMissing', () => {
    const report = summarizeCoverage({}, names, ['checkout.completed'])
    expect(report.missed).toEqual(['checkout.started', 'user.signed_in'])
  })
})

describe('formatCoverageSummary', () => {
  it('renders an all-hit summary', () => {
    const report = summarizeCoverage(
      { 'checkout.completed': 1, 'checkout.started': 1, 'user.signed_in': 1 },
      Object.keys(schemas),
    )
    expect(formatCoverageSummary(report)).toBe('Coverage: 3/3 (100%) — all events hit')
  })

  it('lists missed events with a tail when there are many', () => {
    const report = summarizeCoverage({}, ['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    expect(formatCoverageSummary(report)).toBe(
      'Coverage: 0/7 (0%) — missed: a, b, c, d, e (+2 more)',
    )
  })
})
