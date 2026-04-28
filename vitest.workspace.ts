import { defineWorkspace } from 'vitest/config'

/**
 * Two test projects:
 * - `node` runs everything in a Node environment (existing behavior).
 * - `browser` runs the isomorphic modules under happy-dom so DOM-dependent
 *   paths (e.g. httpPublisher's `navigator.sendBeacon` on visibilitychange)
 *   actually exercise the browser code paths instead of falling through.
 */
export default defineWorkspace([
  {
    test: {
      name: 'node',
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'browser',
      environment: 'happy-dom',
      include: [
        'src/catalog.test.ts',
        'src/coverage.test.ts',
        'src/http-publisher.test.ts',
      ],
    },
  },
])
