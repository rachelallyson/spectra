import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'observability-core',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
