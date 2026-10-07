import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// scripts/ is included so the migration-safety test can run. Those files stay out
// of `coverage.include` below — they are build/ops tooling, not shipped code.
const NODE_TESTS = [
  'src/domain/**/*.test.{ts,tsx}',
  'src/data/**/*.test.{ts,tsx}',
  'src/testing/**/*.test.{ts,tsx}',
  'functions/**/*.test.ts',
  'scripts/**/*.test.ts',
]

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@domain': path.resolve(import.meta.dirname, 'src/domain'),
      '@config': path.resolve(import.meta.dirname, 'config'),
      // VitePWA is not loaded here, so its virtual module has to come from somewhere.
      'virtual:pwa-register/react': path.resolve(
        import.meta.dirname,
        'src/test/pwaRegisterStub.ts',
      ),
    },
  },
  test: {
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    // Tests that never touch the DOM run in node: building a jsdom environment costs about
    // 0.2s per test file. A file in node that starts needing `document` fails with "document
    // is not defined"; opt it back in with `// @vitest-environment jsdom` on its first line.
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: NODE_TESTS,
          exclude: ['functions/domain/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['functions/domain/**', ...NODE_TESTS],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      // `include` alone makes every matching file count even if no test ever
      // imports it — untested files show as 0% instead of vanishing from the
      // denominator, which would otherwise inflate the %.
      // workers/ was absent, so a change touching only the backup cron escaped the
      // diff-coverage gate entirely — the one piece of code nobody watches run.
      include: ['src/**/*.{ts,tsx}', 'functions/**/*.ts', 'workers/**/*.ts'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
        // Dev-only tooling for capturing docs screenshots, not app logic.
        'src/data/docsCapture*.ts',
        // The vitest setup and its stubs: harness, not anything that ships. Counted
        // as source until now, which made a stub whose only job is to make an import
        // resolve look like untested application code.
        'src/test/**',
        'functions/domain/**',
      ],
      reporter: ['text', 'lcov', 'json-summary'],
      thresholds: {
        // Floor, not a target: this only guards against the overall number regressing.
        // New and changed code is held to a far higher bar by the diff-coverage check in
        // CI (scripts/check-diff-coverage.mjs), not by this. See docs/TESTING.md.
        //
        // Set about two points under the measured figure, which leaves room for the
        // run-to-run wobble without letting a real drop through. **Re-measure and raise
        // these when coverage rises.** They were calibrated once against a 44/37/38/46
        // baseline and left there while the real numbers reached 74/68/71/76, which is
        // a floor a third of the way below the building: coverage could have fallen by
        // half and this would have passed.
        // Measured 2026-09-16: 74.3 / 67.7 / 70.6 / 76.5
        statements: 72,
        branches: 65,
        functions: 68,
        lines: 74,
      },
    },
  },
})
