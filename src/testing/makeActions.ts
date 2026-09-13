/**
 * A complete `ExpenseActions` of `vi.fn()`s for component tests.
 *
 * Lives apart from `factories.ts` so that file stays domain-only; this one
 * necessarily reaches into the UI layer for the interface.
 *
 * Why it exists rather than each test hand-rolling the object: the actions whose
 * handlers resolve with a value (`createFlag`, `createInstallmentPlan`, and soon
 * `createTransaction`) are satisfied at the type level by
 * `vi.fn().mockResolvedValue(undefined)`. A hand-rolled mock therefore keeps
 * compiling after the interface widens, and any assertion about the resolved
 * value passes vacuously. Resolving a real object here makes that impossible.
 */
import { vi } from 'vitest'
import type { ExpenseActions } from '../ui/actions'
import { makeFlag, makeScenario, makeTransaction, makeWealthAccount, makeWealthCheckin } from './factories'

export function makeActions(overrides: Partial<ExpenseActions> = {}): ExpenseActions {
  return {
    onEdit: vi.fn(),
    onAdd: vi.fn(),
    onDuplicate: vi.fn(),
    createTransaction: vi.fn().mockResolvedValue(makeTransaction()),
    createTransactions: vi.fn().mockResolvedValue(undefined),
    updateTransaction: vi.fn().mockResolvedValue(undefined),
    deleteTransaction: vi.fn().mockResolvedValue(undefined),
    deleteTransactions: vi.fn().mockResolvedValue(undefined),
    updateTransactions: vi.fn().mockResolvedValue(undefined),
    setStatementPaid: vi.fn().mockResolvedValue(undefined),
    setCashActual: vi.fn().mockResolvedValue(undefined),
    uploadAttachment: vi.fn().mockResolvedValue(undefined),
    deleteAttachment: vi.fn().mockResolvedValue(undefined),
    createFlag: vi.fn().mockResolvedValue(makeFlag()),
    updateFlag: vi.fn().mockResolvedValue(undefined),
    deleteFlag: vi.fn().mockResolvedValue({ unflagged: 0 }),
    createCategory: vi.fn().mockResolvedValue(undefined),
    updateCategory: vi.fn().mockResolvedValue(undefined),
    deleteCategory: vi.fn().mockResolvedValue({ reassigned: 0 }),
    createAccount: vi.fn().mockResolvedValue(undefined),
    updateAccount: vi.fn().mockResolvedValue(undefined),
    deleteAccount: vi.fn().mockResolvedValue({ reassigned: 0 }),
    updateSettings: vi.fn().mockResolvedValue(undefined),
    updateGoals: vi.fn().mockResolvedValue(undefined),
    createScenario: vi.fn().mockResolvedValue(makeScenario()),
    updateScenario: vi.fn().mockResolvedValue(undefined),
    deleteScenario: vi.fn().mockResolvedValue(undefined),
    createInstallmentPlan: vi.fn().mockResolvedValue({ id: 1 }),
    updateInstallmentPlan: vi.fn().mockResolvedValue(undefined),
    deleteInstallmentPlan: vi.fn().mockResolvedValue(undefined),
    createWealthAccount: vi.fn().mockResolvedValue(makeWealthAccount()),
    updateWealthAccount: vi.fn().mockResolvedValue(undefined),
    deleteWealthAccount: vi.fn().mockResolvedValue(undefined),
    createWealthCheckin: vi.fn().mockResolvedValue(makeWealthCheckin()),
    updateWealthCheckin: vi.fn().mockResolvedValue(undefined),
    deleteWealthCheckin: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}
