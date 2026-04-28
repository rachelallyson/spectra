import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SchemaMap } from './catalog.js'
import {
  summarizeCoverage,
  type CoverageReport,
  type CoverageSnapshot,
} from './coverage.js'

/**
 * Node-only helpers for the coverage flow: read JSONL written by
 * fileSinkPublisher, write a markdown report. The actual tally→report
 * reduction lives in `./coverage` so the same logic works for in-memory
 * snapshots shipped from a browser.
 */

export type { CoverageEntry, CoverageReport } from './coverage.js'

function readSnapshot(jsonlPath: string): CoverageSnapshot {
  const counts: CoverageSnapshot = {}

  if (!existsSync(jsonlPath)) return counts
  const raw = readFileSync(jsonlPath, 'utf8')

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line) as { event?: string }
      const name = parsed.event

      if (typeof name === 'string') {
        counts[name] = (counts[name] ?? 0) + 1
      }
    } catch {
      // Skip malformed lines; don't fail the report on a single bad row.
    }
  }

  return counts
}

export function buildCoverageReport(
  jsonlPath: string,
  catalogNames: string[],
  allowMissing: string[] = [],
): CoverageReport {
  return summarizeCoverage(readSnapshot(jsonlPath), catalogNames, allowMissing)
}

export function writeCoverageMarkdown(
  report: CoverageReport,
  filePath: string,
  meta: { generatedAt?: Date; suiteName?: string } = {},
): void {
  const generated = meta.generatedAt ?? new Date()
  const lines: string[] = []

  lines.push('# Observability Coverage Report', '')
  if (meta.suiteName) lines.push(`Suite: **${meta.suiteName}**`)
  lines.push(`Generated: ${generated.toISOString()}`, '')
  lines.push(`- Catalog size: **${report.total}**`)
  lines.push(`- Hit: **${report.hit.length}**`)
  lines.push(`- Missed: **${report.missed.length}**`, '')

  if (report.missed.length > 0) {
    lines.push('## Missed events', '')
    lines.push('Defined in the catalog but never emitted by this suite.')
    lines.push('Either add a test that exercises them or add the name to')
    lines.push('`allowMissing` with a justification.')
    lines.push('')
    for (const name of report.missed) lines.push(`- \`${name}\``)
    lines.push('')
  }

  lines.push('## Hit events', '')
  lines.push('| Event | Count |')
  lines.push('|---|---|')
  for (const row of report.hit) lines.push(`| \`${row.name}\` | ${row.count} |`)

  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${lines.join('\n')}\n`)
}

export function reportCoverage(opts: {
  jsonlPath: string
  markdownPath: string
  schemas?: SchemaMap
  catalogNames?: string[]
  allowMissing?: string[]
  suiteName?: string
}): CoverageReport {
  const names = opts.catalogNames ?? (opts.schemas ? Object.keys(opts.schemas) : [])

  if (names.length === 0) {
    throw new Error(
      '[observability/coverage-report] reportCoverage needs `schemas` or `catalogNames`.',
    )
  }
  const report = buildCoverageReport(opts.jsonlPath, names, opts.allowMissing ?? [])

  writeCoverageMarkdown(report, opts.markdownPath, { suiteName: opts.suiteName })

  return report
}
