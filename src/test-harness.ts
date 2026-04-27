import { writeFileSync } from 'node:fs'
import type { Catalog, CatalogEvent, SchemaMap } from './catalog'
import { memoryPublisher } from './publishers'

/**
 * Test harness for catalog-driven observability. Three jobs:
 *
 *  1. Capture every event emitted during a test in memory so individual tests
 *     can assert exact sequences for critical flows.
 *  2. Aggregate hits across the whole suite so we can fail the build if any
 *     catalog entry was never exercised — Stratum coverage backstop.
 *  3. Optionally write a markdown coverage report after the suite, so PR
 *     reviewers can see what each test hit and what's drifting.
 *
 * Every app gets its own harness from its own catalog instance — keeps
 * coverage state isolated when a process hosts multiple apps.
 */

export interface CoverageHit<TMap extends SchemaMap> {
  name: keyof TMap
  testName: string
  count: number
}

export interface SequenceMatchOptions {
  /** When true, the captured stream may contain other events between the expected ones. */
  allowGaps?: boolean
}

export function createTestHarness<TMap extends SchemaMap>(catalog: Catalog<TMap>) {
  const memory = memoryPublisher<TMap>()
  const coverage = new Map<keyof TMap, Map<string, number>>()
  let activeTest: string | undefined

  const recordHit = (event: CatalogEvent<TMap>) => {
    if (!activeTest) return
    const perTest = coverage.get(event.name) ?? new Map<string, number>()

    perTest.set(activeTest, (perTest.get(activeTest) ?? 0) + 1)
    coverage.set(event.name, perTest)
  }

  return {
    /** Install the in-memory publisher for the duration of one test. */
    install(testName: string) {
      activeTest = testName
      memory.clear()
      catalog.setPublishers([
        memory,
        {
          name: 'coverage-tracker',
          publish: recordHit,
        },
      ])
    },

    /** Tear down — call in afterEach so other tests start clean. */
    uninstall() {
      activeTest = undefined
      catalog.setPublishers([])
      memory.clear()
    },

    /** Returns the events captured since the most recent install. */
    captured(): CatalogEvent<TMap>[] {
      return [...memory.capture()]
    },

    /**
     * Assert the given event names appear in the captured stream in order.
     * With `allowGaps: false` (default) the stream must match exactly.
     * Throws a readable diff on mismatch.
     */
    expectSequence(expected: Array<keyof TMap>, opts: SequenceMatchOptions = {}): void {
      const captured = memory.capture()
      const actual = captured.map((e) => e.name)

      if (opts.allowGaps) {
        let cursor = 0

        for (const target of expected) {
          while (cursor < actual.length && actual[cursor] !== target) cursor += 1
          if (cursor >= actual.length) {
            throw new Error(
              `[observability/test] expected event "${String(target)}" missing from stream.\n  expected (subseq): ${expected.map(String).join(' → ')}\n  actual: ${actual.map(String).join(' → ') || '(none)'}`,
            )
          }
          cursor += 1
        }

        return
      }

      const matches =
        expected.length === actual.length && expected.every((name, i) => name === actual[i])

      if (!matches) {
        throw new Error(
          `[observability/test] event sequence mismatch.\n  expected: ${expected.map(String).join(' → ')}\n  actual:   ${actual.map(String).join(' → ') || '(none)'}`,
        )
      }
    },

    /** Look up the captured payload for the first occurrence of an event. */
    findFirst<N extends keyof TMap>(name: N): CatalogEvent<TMap, N> | undefined {
      return memory.capture().find((e) => e.name === name) as CatalogEvent<TMap, N> | undefined
    },

    /** Coverage snapshot keyed by event name → list of test names that hit it. */
    coverageReport(): {
      hit: Array<{ name: keyof TMap; tests: string[]; count: number }>
      missed: Array<keyof TMap>
    } {
      const hit: Array<{ name: keyof TMap; tests: string[]; count: number }> = []
      const missed: Array<keyof TMap> = []

      for (const name of catalog.eventNames) {
        const perTest = coverage.get(name)

        if (!perTest || perTest.size === 0) {
          missed.push(name)
          continue
        }
        let count = 0

        for (const c of perTest.values()) count += c
        hit.push({ count, name, tests: [...perTest.keys()] })
      }

      return { hit, missed }
    },

    /**
     * Throws if any catalog entry has zero hits. Optionally allowlist names
     * that are intentionally not testable in this layer (e.g. real migration
     * events that need a live church).
     */
    assertFullCoverage(allowMissing: Array<keyof TMap> = []): void {
      const { missed } = this.coverageReport()
      const allow = new Set(allowMissing)
      const unexpected = missed.filter((name) => !allow.has(name))

      if (unexpected.length > 0) {
        throw new Error(
          `[observability/test] catalog entries never emitted:\n  ${unexpected.map(String).join('\n  ')}\n\nEither add a test that exercises them or pass them in allowMissing with a justification.`,
        )
      }
    },

    /** Write a markdown report — run from a vitest globalTeardown. */
    writeMarkdownReport(filePath: string): void {
      const { hit, missed } = this.coverageReport()
      const lines: string[] = []

      lines.push('# Observability Coverage Report', '')
      lines.push(`Generated: ${new Date().toISOString()}`, '')
      lines.push(`- Catalog size: **${catalog.eventNames.length}**`)
      lines.push(`- Hit: **${hit.length}**`)
      lines.push(`- Missed: **${missed.length}**`, '')

      if (missed.length > 0) {
        lines.push('## Missed events', '')
        for (const name of missed) lines.push(`- \`${String(name)}\``)
        lines.push('')
      }

      lines.push('## Hit events', '')
      lines.push('| Event | Hits | Tests |')
      lines.push('|---|---|---|')
      for (const row of hit.sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
        lines.push(`| \`${String(row.name)}\` | ${row.count} | ${row.tests.join(', ')} |`)
      }

      writeFileSync(filePath, `${lines.join('\n')}\n`)
    },

    /** Reset coverage between suite runs. */
    resetCoverage() {
      coverage.clear()
    },
  }
}

export type TestHarness<TMap extends SchemaMap> = ReturnType<typeof createTestHarness<TMap>>
