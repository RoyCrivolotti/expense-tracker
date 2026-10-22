import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'content',
    'coverage',
    'workers/**/.wrangler/**',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['functions/**/*.test.ts', 'workers/**'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Keep files and functions small and readable - see docs/ARCHITECTURE.md
      // for why these thresholds exist.
      'max-lines': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'error',
        { max: 60, skipBlankLines: true, skipComments: true },
      ],
      complexity: ['error', 12],
      'max-depth': ['error', 3],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['workers/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.worker,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'max-lines': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': [
        'error',
        { max: 60, skipBlankLines: true, skipComments: true },
      ],
      complexity: ['error', 12],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Plain JS: build/dev scripts and this config file. Not part of any
    // tsconfig project, so they get the non-type-checked recommended set.
    // NOTE: this block must stay scoped with `files`. Without it, flat config
    // applies it to every linted file and the `off` rules below silently
    // disable the size limits repo-wide - which is exactly what happened.
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'max-lines-per-function': 'off',
      'max-lines': 'off',
    },
  },
  {
    // `functions/**/*.test.ts` is excluded from tsconfig.functions.json, so it
    // cannot be type-checked-linted by the first block. Lint it with the
    // non-type-checked set instead of dropping it entirely.
    files: ['functions/**/*.test.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // Tests and config files exercise more setup; relax size limits.
    files: ['**/*.test.{ts,tsx}', '**/test/**', '*.config.{ts,js}'],
    rules: {
      'max-lines-per-function': 'off',
      'max-lines': 'off',
    },
  },
  // ---------------------------------------------------------------------------
  // Grandfathered size violations.
  //
  // The size limits above were silently disabled for ~every file by an
  // unscoped config block. Re-scoping it surfaced 77 pre-existing violations.
  // These two lists freeze that debt so the limits are live for NEW code.
  //
  // Rules for touching these lists:
  //   - NEVER add a file. A new violation means split the file/function.
  //   - Remove a file once it is under the limit; that is the only edit.
  //   - Each list exempts ONE rule, so a file here is still held to the other.
  //
  // See docs/ARCHITECTURE.md "Size and complexity".
  // ---------------------------------------------------------------------------
  {
    files: [
      'functions/_shared/access/accessDb.ts',       // 207 lines
      'functions/_shared/access/accessService.ts',  // 234 lines
      'functions/_shared/dbConfig.ts',              // 478 lines
      'functions/_shared/dbWealth.ts',              // 228 lines
      'functions/_shared/dbWrite.ts',               // 236 lines
      'functions/_shared/rows.ts',                  // 265 lines
      'src/data/docsCaptureDataSource.ts',          // 281 lines
      'src/domain/engine/projection.ts',            // 242 lines
      'src/testing/inMemoryExpenseRepository.ts',   // 595 lines
      'src/ui/ExpensesApp.tsx',                     // 321 lines
      'src/ui/charts/LinearChart.tsx',              // 227 lines
      'src/ui/charts/linearChartParts.tsx',         // 238 lines
      'src/ui/components/BatchTransactionForm.tsx', // 286 lines
      'src/ui/datasetPatches.ts',                   // 285 lines
      'src/ui/definitions/ConfigModal.tsx',         // 308 lines
      'src/ui/onboarding/OnboardingWizard.tsx',     // 211 lines
      'src/ui/tabs/goals/GoalControls.tsx',         // 335 lines
      'src/ui/tabs/goals/GoalsTab.tsx',             // 320 lines
      'src/ui/tabs/goals/SecondaryCharts.tsx',      // 288 lines
      'src/ui/tabs/goals/charts/NetWorthChart.tsx', // 292 lines
      'src/ui/tabs/goals/goalControlFields.tsx',    // 209 lines
    ],
    rules: { 'max-lines': 'off' },
  },
  {
    files: [
      'functions/_shared/db.ts',                          // worst: 85 lines
      'src/testing/inMemoryExpenseRepository.ts',         // worst: 517 lines
      'src/ui/ExpensesApp.tsx',                           // worst: 116 lines (2 fns)
      'src/ui/access/ActiveUsersSection.tsx',             // worst: 93 lines
      'src/ui/access/PendingRequestsSection.tsx',         // worst: 67 lines
      'src/ui/access/RequestAccessScreen.tsx',            // worst: 67 lines
      'src/ui/analytics/mobile/CashReconMobile.tsx',      // worst: 65 lines
      'src/ui/charts/LinearChart.tsx',                    // worst: 134 lines
      'src/ui/components/BatchTransactionForm.tsx',       // worst: 246 lines (3 fns)
      'src/ui/components/CardStatementsCard.tsx',         // worst: 69 lines
      'src/ui/components/DatePickerPopover.tsx',          // worst: 131 lines
      'src/ui/components/GoalsCard.tsx',                  // worst: 64 lines
      'src/ui/components/MonthPickerPopover.tsx',         // worst: 95 lines
      'src/ui/components/ReassignDeleteSheet.tsx',        // worst: 92 lines
      'src/ui/components/StatementToggles.tsx',           // worst: 76 lines
      'src/ui/components/SwipeTransactionRow.tsx',        // worst: 77 lines
      'src/ui/components/TransactionForm.tsx',            // worst: 115 lines
      'src/ui/components/TransactionModal.tsx',           // worst: 62 lines
      'src/ui/definitions/ConfigModal.tsx',               // worst: 77 lines
      'src/ui/definitions/InstallmentPlanForm.tsx',       // worst: 131 lines
      'src/ui/hooks/usePullToRefresh.ts',                 // worst: 63 lines
      'src/ui/hooks/useSwipeReveal.ts',                   // worst: 70 lines
      'src/ui/onboarding/OnboardingAccountsStep.tsx',     // worst: 69 lines
      'src/ui/onboarding/OnboardingCategoriesStep.tsx',   // worst: 67 lines
      'src/ui/onboarding/OnboardingMoneyStep.tsx',        // worst: 66 lines
      'src/ui/onboarding/OnboardingWizard.tsx',           // worst: 152 lines
      'src/ui/settings/ImportDataSection.tsx',            // worst: 87 lines
      'src/ui/settings/MilestonesSetting.tsx',            // worst: 90 lines (2 fns)
      'src/ui/settings/PreferencesSetting.tsx',           // worst: 66 lines
      'src/ui/tabs/InstallmentsCard.tsx',                 // worst: 66 lines
      'src/ui/tabs/SettingsTab.tsx',                      // worst: 74 lines
      'src/ui/tabs/TransactionsTab.tsx',                  // worst: 100 lines
      'src/ui/tabs/TxnFilters.tsx',                       // worst: 69 lines
      'src/ui/tabs/goals/ActiveScenarioHeader.tsx',       // worst: 120 lines
      'src/ui/tabs/goals/CheckinFormSheet.tsx',           // worst: 115 lines
      'src/ui/tabs/goals/CheckinList.tsx',                // worst: 71 lines
      'src/ui/tabs/goals/GoalControls.tsx',               // worst: 149 lines (3 fns)
      'src/ui/tabs/goals/GoalsTab.tsx',                   // worst: 237 lines
      'src/ui/tabs/goals/SecondaryCharts.tsx',            // worst: 62 lines
      'src/ui/tabs/goals/WealthAccountsManager.tsx',      // worst: 101 lines
      'src/ui/tabs/goals/charts/CheckinHistoryChart.tsx', // worst: 72 lines
      'src/ui/tabs/goals/charts/CompositionChart.tsx',    // worst: 71 lines
      'src/ui/tabs/goals/charts/MilestoneMatrix.tsx',     // worst: 68 lines
      'src/ui/tabs/goals/charts/NetWorthChart.tsx',       // worst: 129 lines
      'src/ui/tabs/goals/charts/RentVsOwnChart.tsx',      // worst: 61 lines
      'src/ui/tabs/useTransactionsTabState.ts',           // worst: 79 lines
      'src/ui/useExpenseActions.ts',                      // worst: 130 lines (2 fns)
      'src/ui/useExpenseData.ts',                         // worst: 96 lines (2 fns)
    ],
    rules: { 'max-lines-per-function': 'off' },
  },
])
