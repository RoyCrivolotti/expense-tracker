import { readFileSync } from 'node:fs'
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// The test files the backend tests project leaves out; the lint block for them skips the same ones, so the list is read
// from the project and kept in one place. A bare directory means everything under it.
const NOT_IN_TESTS_PROJECT = JSON.parse(
  readFileSync(new URL('./tsconfig.functions-tests.json', import.meta.url), 'utf8'),
).exclude.map((entry) => (entry.endsWith('.ts') ? entry : `${entry}/**`))

// Files that were over a size limit before the limits were switched back on, each with the size it had then. A listed
// file may not grow past its entry and keeps the other limit. Do not add a file: split it. Lower an entry when its file
// shrinks, and take the file off the list when it fits.
const FILE_LINE_CAPS = {
  'functions/_shared/restoreSql.ts': 299,
  'functions/_shared/testing/rollupMutants.ts': 253,
  'src/data/apiDataSource.ts': 318,
  'src/data/docsCaptureDataSource.ts': 561,
  'src/data/ledgerHold.ts': 216,
  'src/data/ledgerSession.ts': 376,
  'src/data/transactionPager.ts': 278,
  'src/domain/data/dataSource.ts': 224,
  'src/domain/engine/dates.ts': 201,
  'src/domain/engine/marketSpread.ts': 203,
  'src/domain/engine/projection.ts': 213,
  'src/domain/engine/rentVsBuy.ts': 206,
  'src/testing/inMemoryExpenseRepository.ts': 1211,
  'src/testing/transactionQueryKit.ts': 276,
  'src/ui/ExpensesApp.tsx': 445,
  'src/ui/charts/LinearChart.tsx': 350,
  'src/ui/charts/linearChartParts.tsx': 461,
  'src/ui/charts/valueTags.ts': 203,
  'src/ui/components/BatchTransactionForm.tsx': 329,
  'src/ui/components/InstallmentStep.tsx': 212,
  'src/ui/components/ReceiptStrip.tsx': 296,
  'src/ui/components/TransactionFields.tsx': 342,
  'src/ui/components/TransactionForm.tsx': 392,
  'src/ui/components/TransactionModal.tsx': 219,
  'src/ui/datasetPatches.ts': 383,
  'src/ui/tabs/TransactionsTab.tsx': 268,
  'src/ui/tabs/TxnFilterRows.tsx': 403,
  'src/ui/tabs/goals/ContributionSteps.tsx': 208,
  'src/ui/tabs/goals/SecondaryCharts.tsx': 231,
  'src/ui/tabs/goals/StartLaterSheet.tsx': 218,
  'src/ui/tabs/goals/WealthSummaryCard.tsx': 423,
  'src/ui/tabs/goals/charts/MilestoneGrid.tsx': 262,
  'src/ui/tabs/goals/charts/MilestoneMatrix.tsx': 339,
  'src/ui/tabs/goals/charts/MilestoneTimeline.tsx': 392,
  'src/ui/tabs/goals/charts/NetWorthChart.tsx': 834,
  'src/ui/tabs/goals/charts/heroSeries.ts': 244,
  'src/ui/tabs/goals/charts/milestoneModel.ts': 332,
  'src/ui/tabs/goals/charts/spreadModel.ts': 208,
  'src/ui/tabs/goals/desktop/Lever.tsx': 219,
  'src/ui/tabs/goals/desktop/ScenarioChips.tsx': 212,
  'src/ui/tabs/goals/goalControlFields.tsx': 207,
  'src/ui/tabs/goals/goalControlSections.tsx': 414,
  'src/ui/tabs/goals/startLaterModel.ts': 214,
  'src/ui/tabs/useTransactionSelection.ts': 212,
  'src/ui/tabs/useTransactionsTabState.ts': 260,
  'src/ui/useExpenseActions.ts': 288,
  'src/ui/useLedgerData.ts': 201,
}

const FUNCTION_LINE_CAPS = {
  'src/data/inMemoryLedgerParts.ts': 68,
  'src/testing/fakeIntersectionObserver.ts': 63,
  'src/testing/inMemoryExpenseRepository.ts': 1096,
  'src/testing/ledgerSource.ts': 72,
  'src/testing/seedSqlite.ts': 70,
  'src/testing/smallLedgerDb.ts': 68,
  'src/testing/syntheticTransactions.ts': 77,
  'src/ui/ExpensesApp.tsx': 139,
  'src/ui/access/PendingRequestsSection.tsx': 67,
  'src/ui/access/RequestAccessScreen.tsx': 67,
  'src/ui/analytics/overview/OverviewView.tsx': 63,
  'src/ui/analytics/overview/TrendChart.tsx': 114,
  'src/ui/analytics/overview/overviewModel.ts': 63,
  'src/ui/analytics/spending/SpendingView.tsx': 100,
  'src/ui/capture/CardQuestion.tsx': 68,
  'src/ui/capture/useRecommendationList.ts': 63,
  'src/ui/capture/useReviewApi.ts': 65,
  'src/ui/charts/LinearChart.tsx': 206,
  'src/ui/charts/useChartFocus.ts': 79,
  'src/ui/charts/valueTags.ts': 64,
  'src/ui/components/BatchTransactionForm.tsx': 290,
  'src/ui/components/CardStatementsCard.tsx': 99,
  'src/ui/components/DatePickerPopover.tsx': 125,
  'src/ui/components/FlagField.tsx': 69,
  'src/ui/components/FlagPickerPopover.tsx': 84,
  'src/ui/components/GoalsCard.tsx': 88,
  'src/ui/components/LabelPickerPopover.tsx': 85,
  'src/ui/components/Modal.tsx': 68,
  'src/ui/components/MonthPickerPopover.tsx': 80,
  'src/ui/components/PercentStepper.tsx': 64,
  'src/ui/components/QuickCreateLabel.tsx': 69,
  'src/ui/components/ReassignDeleteSheet.tsx': 75,
  'src/ui/components/ReceiptStrip.tsx': 87,
  'src/ui/components/StatementPaymentSheet.tsx': 84,
  'src/ui/components/StatementToggles.tsx': 85,
  'src/ui/components/SwipeTransactionRow.tsx': 110,
  'src/ui/components/TransactionFields.tsx': 140,
  'src/ui/components/TransactionForm.tsx': 206,
  'src/ui/components/TransactionModal.tsx': 79,
  'src/ui/components/TransactionRow.tsx': 62,
  'src/ui/definitions/LabelsModal.tsx': 69,
  'src/ui/hooks/rowHeights.ts': 64,
  'src/ui/hooks/usePullToRefresh.ts': 63,
  'src/ui/hooks/useSwipeDismiss.ts': 100,
  'src/ui/hooks/useSwipeReveal.ts': 69,
  'src/ui/onboarding/OnboardingAccountsStep.tsx': 65,
  'src/ui/onboarding/OnboardingCategoriesStep.tsx': 65,
  'src/ui/settings/CaptureCardsSetting.tsx': 66,
  'src/ui/settings/useCaptureSetup.ts': 63,
  'src/ui/tabs/BulkEditSheet.tsx': 127,
  'src/ui/tabs/TransactionsFlagOverlays.tsx': 69,
  'src/ui/tabs/TransactionsSelectFooter.tsx': 89,
  'src/ui/tabs/TransactionsTab.tsx': 226,
  'src/ui/tabs/TxnFilterRows.tsx': 105,
  'src/ui/tabs/TxnFilters.tsx': 77,
  'src/ui/tabs/TxnFiltersSheet.tsx': 112,
  'src/ui/tabs/goals/ActiveScenarioHeader.tsx': 98,
  'src/ui/tabs/goals/AdjustSectionNav.tsx': 79,
  'src/ui/tabs/goals/CheckinFormSheet.tsx': 152,
  'src/ui/tabs/goals/CheckinList.tsx': 95,
  'src/ui/tabs/goals/ContributionSteps.tsx': 113,
  'src/ui/tabs/goals/GoalsExplainer.tsx': 69,
  'src/ui/tabs/goals/GoalsTab.tsx': 154,
  'src/ui/tabs/goals/LifeEvents.tsx': 78,
  'src/ui/tabs/goals/PlanHero.tsx': 99,
  'src/ui/tabs/goals/ProgressView.tsx': 68,
  'src/ui/tabs/goals/StartLaterSheet.tsx': 67,
  'src/ui/tabs/goals/UnsavedGroup.tsx': 62,
  'src/ui/tabs/goals/WealthAccountsManager.tsx': 133,
  'src/ui/tabs/goals/WealthSummaryCard.tsx': 77,
  'src/ui/tabs/goals/charts/CheckinHistoryChart.tsx': 93,
  'src/ui/tabs/goals/charts/CompositionChart.tsx': 96,
  'src/ui/tabs/goals/charts/FireChart.tsx': 90,
  'src/ui/tabs/goals/charts/MilestoneByGoal.tsx': 104,
  'src/ui/tabs/goals/charts/MilestoneGrid.tsx': 109,
  'src/ui/tabs/goals/charts/MilestoneMatrix.tsx': 131,
  'src/ui/tabs/goals/charts/MilestonePicker.tsx': 67,
  'src/ui/tabs/goals/charts/MilestoneTimeline.tsx': 71,
  'src/ui/tabs/goals/charts/NetWorthChart.tsx': 284,
  'src/ui/tabs/goals/charts/NetWorthHistoryChart.tsx': 86,
  'src/ui/tabs/goals/charts/NetWorthNowCard.tsx': 82,
  'src/ui/tabs/goals/charts/RentVsOwnChart.tsx': 84,
  'src/ui/tabs/goals/charts/SavingsRateChart.tsx': 83,
  'src/ui/tabs/goals/charts/ScenarioComparison.tsx': 78,
  'src/ui/tabs/goals/charts/SpreadChart.tsx': 138,
  'src/ui/tabs/goals/charts/heroSheet/HeroChartSheet.tsx': 68,
  'src/ui/tabs/goals/charts/heroSheet/HeroFloatingReadout.tsx': 70,
  'src/ui/tabs/goals/desktop/Lever.tsx': 115,
  'src/ui/tabs/goals/desktop/PlanDesktop.tsx': 72,
  'src/ui/tabs/goals/desktop/ScenarioMenu.tsx': 92,
  'src/ui/tabs/goals/goalControlFields.tsx': 61,
  'src/ui/tabs/goals/useScenarioEditor.ts': 148,
  'src/ui/tabs/goals/useStarredLevers.ts': 103,
  'src/ui/tabs/useTransactionSelection.ts': 136,
  'src/ui/tabs/useTransactionsTabState.ts': 160,
  'src/ui/useExpenseActions.ts': 248,
  'src/ui/useExpenseData.ts': 97,
  'src/ui/useLedgerData.ts': 119,
}

export default defineConfig([
  globalIgnores(['dist', 'content', 'coverage', 'workers/**/.wrangler/**']),
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
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 12],
      'max-depth': ['error', 3],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['workers/**/*.ts'],
    // Tests are outside the worker's tsconfig, as functions' tests are outside the first block above.
    ignores: ['workers/**/*.test.ts'],
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
      'max-lines-per-function': ['error', { max: 60, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 12],
      'max-depth': ['error', 3],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Backend and Worker tests are type-checked by tsconfig.functions-tests.json, and the ones it excludes are skipped
    // here too. The `*.client.*` tests drive the browser's data layer against the real routes, and two more import UI
    // code; they need both the DOM and the Worker globals, which one project cannot hold (the two define Response
    // differently), so they stay with the basic block below.
    files: ['functions/**/*.test.ts', 'workers/**/*.test.ts'],
    ignores: NOT_IN_TESTS_PROJECT,
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // This block has no `files`, so it applies to every linted file, and it comes after the blocks that set the size
    // limits. It must not set rules, or it overrides them: it once turned both limits off for the whole repo.
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  ...Object.entries(FILE_LINE_CAPS).map(([file, max]) => ({
    files: [file],
    rules: { 'max-lines': ['error', { max, skipBlankLines: true, skipComments: true }] },
  })),
  ...Object.entries(FUNCTION_LINE_CAPS).map(([file, max]) => ({
    files: [file],
    rules: { 'max-lines-per-function': ['error', { max, skipBlankLines: true, skipComments: true }] },
  })),
  {
    // Tests and config files exercise more setup; relax size limits.
    files: ['**/*.test.{ts,tsx}', '**/test/**', '*.config.{ts,js}'],
    rules: {
      'max-lines-per-function': 'off',
      'max-lines': 'off',
    },
  },
])
