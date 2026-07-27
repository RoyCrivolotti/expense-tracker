import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@domain': path.resolve(import.meta.dirname, 'src/domain'),
      '@config': path.resolve(import.meta.dirname, 'config'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'functions/**/*.test.ts'],
    exclude: ['functions/domain/**'],
    css: true,
    coverage: {
      provider: 'v8',
      // `include` alone makes every matching file count even if no test ever
      // imports it — untested files show as 0% instead of vanishing from the
      // denominator, which would otherwise inflate the %.
      include: ['src/**/*.{ts,tsx}', 'functions/**/*.ts'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        // Dev-only tooling for capturing docs screenshots, not app logic.
        'src/data/docsCapture*.ts',
        'functions/domain/**',
      ],
      reporter: ['text', 'lcov', 'json-summary'],
      thresholds: {
        // Floor, not a target — this only guards against the overall number
        // regressing. Calibrated just below the actual baseline (44.3 / 37.1 /
        // 37.6 / 46.0 measured with `all: true` across the whole src+functions
        // tree) so it fails on any real drop without being flaky. New/changed
        // code is held to a much higher bar via the diff-coverage check in CI
        // (scripts/check-diff-coverage.mjs), not this global floor — see
        // docs/TESTING.md.
        statements: 43,
        branches: 36,
        functions: 36,
        lines: 45,
      },
    },
  },
})
