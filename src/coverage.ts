import type { CatalogEvent, SchemaMap } from './catalog'
import type { Publisher } from './publishers'

/**
 * Isomorphic catalog-coverage primitives. The publisher tallies hit counts per
 * event name in memory; snapshots serialize as plain `Record<string, number>`
 * so a browser can ship its tally to a server (sendBeacon, fetch) and a
 * collector can merge it with the server's own tally before reporting.
 *
 * No `node:` imports here — safe to bundle for the browser.
 */

export type CoverageSnapshot = Record<string, number>

export interface CoverageEntry {
  name: string
  count: number
}

export interface CoverageReport {
  total: number
  hit: CoverageEntry[]
  missed: string[]
}

export interface CoveragePublisher<TMap extends SchemaMap> extends Publisher<TMap> {
  snapshot: () => CoverageSnapshot
  reset: () => void
}

/** Counts hits per event name. Pair with `snapshot()` to read or ship the tally. */
export function coveragePublisher<TMap extends SchemaMap>(): CoveragePublisher<TMap> {
  const counts = new Map<string, number>()

  return {
    name: 'coverage',
    publish(event: CatalogEvent<TMap>) {
      counts.set(event.name as string, (counts.get(event.name as string) ?? 0) + 1)
    },
    snapshot() {
      return Object.fromEntries(counts)
    },
    reset() {
      counts.clear()
    },
  }
}

/** Combine snapshots from multiple sources (e.g. browser + server). */
export function mergeCoverage(snapshots: CoverageSnapshot[]): CoverageSnapshot {
  const merged: CoverageSnapshot = {}

  for (const snap of snapshots) {
    for (const [name, count] of Object.entries(snap)) {
      merged[name] = (merged[name] ?? 0) + count
    }
  }

  return merged
}

/** Reduce a snapshot to a hit/miss report against a known catalog. Pure. */
export function summarizeCoverage(
  snapshot: CoverageSnapshot,
  catalogNames: string[],
  allowMissing: string[] = [],
): CoverageReport {
  const allow = new Set(allowMissing)
  const hit: CoverageEntry[] = []
  const missed: string[] = []

  for (const name of catalogNames) {
    const count = snapshot[name] ?? 0

    if (count === 0) {
      if (!allow.has(name)) missed.push(name)
    } else {
      hit.push({ count, name })
    }
  }

  hit.sort((a, b) => a.name.localeCompare(b.name))

  return { hit, missed, total: catalogNames.length }
}

/**
 * One-line summary suitable for `console.log` or a CI annotation.
 * Example: `Coverage: 12/15 (80%) — missed: foo.bar, baz.qux, ...`
 */
export function formatCoverageSummary(report: CoverageReport): string {
  const pct = report.total === 0 ? 0 : Math.round((report.hit.length / report.total) * 100)
  const head = `Coverage: ${report.hit.length}/${report.total} (${pct}%)`

  if (report.missed.length === 0) return `${head} — all events hit`
  const preview = report.missed.slice(0, 5).join(', ')
  const more = report.missed.length > 5 ? ` (+${report.missed.length - 5} more)` : ''

  return `${head} — missed: ${preview}${more}`
}
